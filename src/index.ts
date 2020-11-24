import * as core from "@actions/core";
import * as github from "@actions/github";
import { exec } from "@actions/exec";

import * as process from "process";
import * as fs from "fs";

const stack = core.getInput("stack", { required: true });
const args = core.getInput("args", { required: true });
const root = core.getInput("root");
if (root) {
  process.chdir(root);
}

const mode = core.getInput("mode");

switch (mode) {
  case "pr":
    if (
      !["opened", "edited", "synchronize"].includes(
        github.context.payload.action as string
      )
    ) {
      core.info(
        `PR event ${github.context.payload.action} contains no changes and does not warrant a Pulumi Preview`
      );
      core.info("Skipping Pulumi action altogether...");
      process.exit(0);
    }
    break;
}

async function run() {
  await exec("pulumi", ["stack", "select", stack]);

  var output = "";

  let options = {
    listeners: {
      stdout: (data: Buffer) => {
        let s = data.toString();
        output += s;
        core.info(s);
      },
      stderr: (data: Buffer) => {
        core.warning(data.toString());
      },
    },
    ignoreReturnCode: true,
  };
  const cmd = "pulumi " + args;
  core.info(`#### :tropical_drink: ${cmd}`);
  const exitCode = await exec(cmd, undefined, options);
  // # If the GitHub action stems from a Pull Request event, we may optionally
  // # leave a comment if the COMMENT_ON_PR is set.
  if (github.context.payload.pull_request && core.getInput("comment-on-pr")) {
    const updateComment = core.getInput("update-existing-comment") || true;
    const token = core.getInput("github-token");
    if (!token) {
      core.setFailed("Can't leave a comment, unknown github-token");
    } else {
      let body = `#### :tropical_drink: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      core.info(`Getting comments`);

      const octokit = github.getOctokit(token);

      const existing = await octokit.issues.listComments({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.payload.pull_request.number,
        per_page: 100,
      });

      core.info(
        `Number of existing comments ${existing.url}, ${existing.status} ${existing.data.length}`
      );

      let commentUpdated = false;
      for (const existingComment of existing.data) {
        if (existingComment.body.includes(`Previewing update (${stack}):`)) {
          try {
            if (updateComment) {
              core.info(`Updating comment ${existingComment.id}`);
              await octokit.issues.updateComment({
                comment_id: existingComment.id,
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                body,
              });

              commentUpdated = true
            } else {
              core.info(`Hiding comment ${existingComment.id}`);
              core.info(
                JSON.stringify(
                  await octokit.graphql(
                    `mutation ($input: MinimizeCommentInput!) {
                    minimizeComment(input: $input) {
                      clientMutationId
                    }
                  }
              `,
                    {
                      input: {
                        subjectId: existingComment.node_id,
                        classifier: "OUTDATED",
                      },
                    }
                  )
                )
              );
            }
          } catch (err) {
            core.info("Request failed: " + JSON.stringify(err.request)); // { query, variables: {}, headers: { authorization: 'token secret123' } }
            core.info(err.message); // `invalid cursor` does not appear to be a valid cursor.
            core.info(err.data); // { repository: { name: 'probot', ref: null } }
          }
        }
      }

      if (!commentUpdated) {
        await octokit.issues.createComment({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          issue_number: github.context.payload.pull_request.number,
          body,
        });
      }
    }
  }
  process.exit(exitCode);
}

run().catch(core.setFailed);

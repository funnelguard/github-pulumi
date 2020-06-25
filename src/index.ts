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

const workflow = github.context.workflow;

if (workflow) {
  core.exportVariable("PULUMI_CI_SYSTEM", "GitHub");
  core.exportVariable("PULUMI_CI_BUILD_ID", "");
  core.exportVariable("PULUMI_CI_BUILD_TYPE", "");
  core.exportVariable("PULUMI_CI_BUILD_URL", "");
  core.exportVariable("PULUMI_CI_PULL_REQUEST_SHA", github.context.sha);
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
  let cmd = "pulumi " + args;
  core.info(`#### :tropical_drink: ${cmd}`);
  const exitCode = 0 // await exec(cmd, undefined, options);
  // # If the GitHub action stems from a Pull Request event, we may optionally
  // # leave a comment if the COMMENT_ON_PR is set.
  if (github.context.payload.pull_request && core.getInput("comment-on-pr")) {
    let commentsUrl = github.context.payload.pull_request
      .comments_url as string;
    let token = core.getInput("github-token");
    if (!token) {
      core.setFailed("Can't leave a comment, unknown github-token");
    } else {
      // let body = `#### :tropical_drink: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      core.info(`Getting comments`);

      const octokit = github.getOctokit(token);

      const existing = await octokit.pulls.listReviewComments({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: github.context.payload.pull_request.number,
        per_page: 100
      });
      
      core.info(`Number of existing comments ${existing.url}, ${existing.status} ${existing.data.length}`);

      for (const existingComment of existing.data) {
        core.info(`Inspecting existing ${existingComment.body}`);

        if (existingComment.body.includes(`Previewing update (${stack}):`)) {
          try {
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
                      subjectId: existingComment.id,
                      classifier: 'OUTDATED'
                    }
                  }
                )
              )
            );
          } catch (err) {
            core.info("Request failed: " + JSON.stringify(err.request)); // { query, variables: {}, headers: { authorization: 'token secret123' } }
            core.info(err.message); // `invalid cursor` does not appear to be a valid cursor.
            core.info(err.data); // { repository: { name: 'probot', ref: null } }
          }
        }
      }
      // await gh.create(commentsUrl, { body }, {
      //     additionalHeaders: {
      //         Authorization: `token ${token}`
      //     }
      // })
    }
  }
  process.exit(exitCode);
}

run().catch(core.setFailed);

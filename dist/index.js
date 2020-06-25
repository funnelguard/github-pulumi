"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const exec_1 = require("@actions/exec");
const process = __importStar(require("process"));
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
        if (!["opened", "edited", "synchronize"].includes(github.context.payload.action)) {
            core.info(`PR event ${github.context.payload.action} contains no changes and does not warrant a Pulumi Preview`);
            core.info("Skipping Pulumi action altogether...");
            process.exit(0);
        }
        break;
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        yield exec_1.exec("pulumi", ["stack", "select", stack]);
        var output = "";
        let options = {
            listeners: {
                stdout: (data) => {
                    let s = data.toString();
                    output += s;
                    core.info(s);
                },
                stderr: (data) => {
                    core.warning(data.toString());
                },
            },
            ignoreReturnCode: true,
        };
        let cmd = "pulumi " + args;
        core.info(`#### :tropical_drink: ${cmd}`);
        const exitCode = yield exec_1.exec(cmd, undefined, options);
        // # If the GitHub action stems from a Pull Request event, we may optionally
        // # leave a comment if the COMMENT_ON_PR is set.
        if (github.context.payload.pull_request && core.getInput("comment-on-pr")) {
            let token = core.getInput("github-token");
            if (!token) {
                core.setFailed("Can't leave a comment, unknown github-token");
            }
            else {
                let body = `#### :tropical_drink: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
                core.info(`Getting comments`);
                const octokit = github.getOctokit(token);
                const existing = yield octokit.issues.listComments({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                    issue_number: github.context.payload.pull_request.number,
                    per_page: 100
                });
                core.info(`Number of existing comments ${existing.url}, ${existing.status} ${existing.data.length}`);
                for (const existingComment of existing.data) {
                    if (existingComment.body.includes(`Previewing update (${stack}):`)) {
                        try {
                            core.info(`Hiding comment ${existingComment.id}`);
                            core.info(JSON.stringify(yield octokit.graphql(`mutation ($input: MinimizeCommentInput!) {
                    minimizeComment(input: $input) {
                      clientMutationId
                    }
                  }
              `, {
                                input: {
                                    subjectId: existingComment.node_id,
                                    classifier: 'OUTDATED'
                                }
                            })));
                        }
                        catch (err) {
                            core.info("Request failed: " + JSON.stringify(err.request)); // { query, variables: {}, headers: { authorization: 'token secret123' } }
                            core.info(err.message); // `invalid cursor` does not appear to be a valid cursor.
                            core.info(err.data); // { repository: { name: 'probot', ref: null } }
                        }
                    }
                }
                yield octokit.issues.createComment({
                    owner: github.context.repo.owner,
                    repo: github.context.repo.repo,
                    issue_number: github.context.payload.pull_request.number,
                    body,
                });
            }
        }
        process.exit(exitCode);
    });
}
run().catch(core.setFailed);

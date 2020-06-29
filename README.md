# setup-pulumi

Github Action. Starts Pulumi in CI environment. See workflow examples [here](./.github/workflows/)

## Usage

```yaml
name: Test

on:
  push:
    branches:
      - master

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v1
    - name: Install Pulumi CLI
      uses: pulumi/action-install-pulumi-cli@releases/v1

    - uses: JakeGinnivan/github-pulumi@master
      with:
        stack: dev
        args: up
        root: example
        github-token: ${{ secrets.GITHUB_TOKEN }}
        comment-on-pr: true
        update-existing-comment: true
      env:
        PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```


### Args

* `update-existing-comment` - default: true, will update the preview comment if it exists, otherwise it will hide the old comment
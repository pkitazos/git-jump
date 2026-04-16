![git-jump CLI logo](https://raw.githubusercontent.com/pkitazos/git-jump/main/img/readme-banner.png)

# Git Branches Helper

* Interactive UI to view and switch branches
* Sorting by recently used
* Fuzzy search
* Fuzzy switch: `git jump hlw` → `git switch hello-world`
* Uses native `git switch` under the hood, supports all its parameters

Give it a ⭐️ if you like it. This really helps.

<p align="center">
  <img src="https://raw.githubusercontent.com/pkitazos/git-jump/main/img/demo.gif" alt="git jump interactive interface" width="600px" style="border-radius: 5px;" />
</p>

## Install

```shell
npm install -g @pkitazos/git-jump
```
<!--or using Homebrew
```shell
brew tap pkitazos/git-jump
brew install git-jump
```-->

## Usage

```shell
git jump
```
Run without arguments to launch the interactive UI.

* At first, branches are not sorted. Once you start switching around, `git jump` will track the history and sort the list, so that the most recently used branches are at the top and can be accessed faster.
* Navigate the list with ↓↑ arrows and hit enter ⏎ to switch into selected branch.
* On the left hand side of the list you'll see a number next to a brunch name. Use <kbd>Option</kbd>+<kbd>\<number\></kbd> for quick switch (<kbd>Alt</kbd>+<kbd>\<number\></kbd> on Windows and Linux).
* Start typing to filter the list. The search is fuzzy, you don't have to be precise.
* Ctrl+C to exit.

<br />

```shell
git jump <branch name>
```
Switches to a branch. When a single argument is provided, `<branch name>` can be just part of the name — `git jump` will look for the best matching local branch if `git switch` doesn't find an exact match.

<br />

```shell
git jump [--list | -l]
```
Shows a plain list of branches without interactive UI but with sorting.

<br />

```shell
git jump <branch name> <any native switch arguments>
```

You can use `git jump` as a drop-in replacement for [native `git switch`](https://git-scm.com/docs/git-switch). When additional arguments are provided, `git jump` proxies everything directly to `git switch` without fuzzy matching, so `<branch name>` must be exact. This mirrors the behavior of the interactive mode, where switching also requires an exact branch name.

For example `git jump my-branch --discard-changes` works just fine.

<br />

```shell
git jump new <branch name>
```
Creates a new branch and switches into it. Supports all native parameters of `git switch`, for example `git jump new <branch name> --track origin/main`.

<br />

```shell
git jump rename <branch name> <new branch name>
```
Renames a branch.

<br />

```shell
git jump delete <branch name> [<branch name>, ...]
```
Deletes one or multiple branches. No fuzzy matching here, of course 🙂.


## How To Enable <kbd>Option/Alt</kbd>+<kbd>\<number\></kbd> Shortcut

It might be disabled by default in your terminal, here is how to make it work in some apps.

### VS Code integrated terminal

In your VS Code settings (`settings.json`), add:

```json
"terminal.integrated.macOptionIsMeta": true
```

### Ghostty

Add the following to your Ghostty config file (`~/.config/ghostty/config`):

```
macos-option-as-alt = true
```

> **Note:** A full app restart (not just a new window) may be required for the change to take effect.

### Zed integrated terminal

In your Zed settings (`~/.config/zed/settings.json`), add:

```json
{
  "terminal": {
    "option_as_meta": true
  }
}
```

### iTerm 2

In Preferences go to `Profiles`, select your profile and go to `Keys`. At the bottom set `Left Option (⌥) Key` to `Esc+`.

![iTerm 2 app preferences window](https://raw.githubusercontent.com/pkitazos/git-jump/main/img/iTerm-Option-key@2x.png)

### macOS Terminal

In Preferences go to `Profiles`, select your profile and go to `Keyboard`. Enable `Use Option as Meta key` checkbox.

![macOS Terminal app preferences window](https://raw.githubusercontent.com/pkitazos/git-jump/main/img/Terminal-Option-key@2x.png)

### Hyper

Open `.hyper.js` and add next line to the `config` section:

```js
modifierKeys: { altIsMeta: true }
```

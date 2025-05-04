# Joplin Plugin - Collapsible block

This Joplin plugin allows you to create collapsible blocks with a title and extendable body. The blocks can be nested within each other, remember whether they were left open or closed, and color-coordinate between the editor and webview. 

**Version**: 1.0


## Installation

- Open Joplin and navigate to `Preferences > Plugins`
- Search for `Collapsible block` and click install
- Restart Joplin

### Uninstall

- Open Joplin and navigate to `Tools > Options > Plugins`
- Search for `Collapsible block` plugin
- Press `Delete` to remove the plugin or `Disable` to disable it
- Restart Joplin

## Usage

### Collapsible block

In order to create a collapsible block, you can:
- press on the `Collapsible block` button or
- use the shortcut `Ctrl + Alt + P`
- select text and use any of the previous options
- or manually write in the following format:

```
:{Block title
    Block body here
    And here
    And here...
}:
```

Nothing but whitespace may come before the `:{`. The title of the block must always appear on the same line as the `:{`. A title may be omitted. You can choose to put the `}:` on the same line as the last line of body text, or on its own line, but nothing is allowed to come after the `}:`. Indenting the body text is optional but recommended. In general it is designed to be extremely forgiving with how things are formatted and indented. The following examples are all valid: 

**Examples**:
```
:{}:

:{Title}:

:{
}:

:{Title
}:

:{
Body}:

:{
Body
}:

:{Title
Body
}:

:{Title
    Body
}:
```
(for readability, the last way is recommended)

Blocks will remember if you left them opened or closed. They will do so by editing the opener in the editor from :{ to :{:{ when opened, or back to :{ when closed. You may also do this manually. 

When nesting blocks within blocks, they will be color-coordinated in both the editor and webview. If this is unwanted, it can be disabled by changing doEditorColors, doWebviewColors, or both from `true` to `false` in `config.json`. 

## Custom styles

If you would like to style the collapsible blocks to your preference, use the following in your `userstyle.css` file:


```css
/* Styling of the collapsible block title */
.cb > summary {
  
}

/* Styling of the collapsible block body */
.cb {
  
}
```

## Notes

- **There might be bugs**, [report them here](https://github.com/ntczkjfg/joplin-plugin-collapsible-block/issues) and I'll try to fix them if I can.
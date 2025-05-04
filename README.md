# Joplin Plugin - Collapsible block

This Joplin plugin allows you to create collapsible blocks with a title and extendable body.

**Note**: Requires Joplin 1.7.11+

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

The title of the block must always appear on the same line as the :{. You can choose to put the }: on the same line as the last line of body text, or on its own line. 

Blocks will remember if you left them opened or closed. They will do so by editing the opener in the editor from :{ to :{:{ when opened, or back to :{ when closed. You may also do this manually. 

**Example**:
```
:{3 ways to check if an Object has a property in JS

Using:
1. `hasOwnProperty()` method
2. `in` operator
3. Comparing with `undefined`
* * *
1) `hasOwnProperty()`
~~~js
const hero = {
  name: 'Batman'
};

hero.toString; // => function() {...}

hero.hasOwnProperty('toString'); // => false
~~~
* * *

}:
```

## Custom styles

If you would like to style the spoiler blocks to your preference, use the following in your `userstyle.css` file:


```css
/* Styling of the spoiler block title */
.summary-title {
  
}

/* Styling of the spoiler block body */
.summary-content {
  
}
```

### Exporting styles

By default when exporting with spoiler blocks, the blocks get extended, show the body and hides the arrows. Inline spoilers stay hidden.

Alternately, if you would like to style the spoiler blocks to your liking when exporting, use the following in you `userstyle.css` file:
```css
@media print {

  /* Hides the side arrow */
  .summary-title:before {
      content: "";
  }

  /* Container for spoiler blocks */
  .spoiler-block {}

  /* Container for spoiler title */
  #spoiler-block-title {}
  
  /* Container for spoiler body */
  #spoiler-block-body {
      /* Shows the body contents */
      display: block;
      animation: none;
  }

}
```

## Notes

- **There might be bugs**, [report them here](https://github.com/martinkorelic/joplin-plugin-spoilers/issues) and I'll try to fix them when I'll find time.
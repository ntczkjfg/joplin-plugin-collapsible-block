import { Decoration, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import config from './config.json';

function addClassToLines(view, builder, lines) {
    if (lines.length === 0) {
        return;
    }
    // Sort lines
    lines.sort((a, b) => a - b);

    /* We will convert lines from something like this:
    [1, 2, 3, 3, 3, 3, 4, 4, 6, 9, 9, 9]
    to something like this: 
    [[1, 1], [2, 1], [3, 4], [4, 2], [6, 1], [9, 3]]
    where each entry is [n, nCount] for each n in the original lines */
    const sortedLinesWithFrequency = [];
    let current = lines[0];
    let count = 1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === current) {
        count++;
      } else {
        sortedLinesWithFrequency.push([current, count]);
        current = lines[i];
        count = 1;
      }
    }
    sortedLinesWithFrequency.push([current, count]);

    // Now add the appropriate class based on sortedLinesWithFrequency
    for (let i = 0; i < sortedLinesWithFrequency.length; i++) {
        let [n, nCount] = sortedLinesWithFrequency[i];
        nCount = (nCount - 1) % 8;
        const from = view.state.doc.line(n).from;
        let classes;
        if (config.doEditorColors) {
            classes = `cb cb-nest-${nCount}`;
        } else {
            classes = 'cb';
        }
        builder.add(from, from, Decoration.line({ class: classes}));
    }
}

function findCollapsibles(view, startToken, endToken) {
    const lines = [];
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
        let line = doc.line(i).text;
        // Remove leading spaces and tabs
        line = line.replace(/^[ \t]+/, "");
        if (!line.startsWith(startToken)) {
            continue;
        }
        if (line.endsWith(endToken)) {
            lines.push(i);
            continue;
        }
        let startLine = i,
            endLine;
        for (let j = i + 1, nestedBlocks = 0; j <= doc.lines; j++) {
            line = doc.line(j).text.replace(/^[ \t]+/, "");
            if (line.startsWith(startToken)) {
                nestedBlocks++;
            }
            if (line.endsWith(endToken)) {
                if (nestedBlocks === 0) {
                    // Found the correct ending
                    endLine = j;
                    break;
                }
                nestedBlocks--;
            }
        }
        if (endLine !== undefined) {
            for (let j = startLine; j <= endLine; j++) {
                lines.push(j);
            }
        }
    }
    addClassToLines(view, builder, lines);
    return builder.finish();
}

const collapsibleEditorColorsPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.startToken = ':{';
        this.endToken   = '}:';
        try {
            this.decorations = findCollapsibles(view, this.startToken, this.endToken);
        } catch (e) {
            console.error('Plugin error:', e);
        }
    }
    update(update) {
        if (update.docChanged || update.viewportChanged) {
            try {
                this.decorations = findCollapsibles(update.view, this.startToken, this.endToken);
            } catch (e) {
                console.error('Plugin error:', e);
            }
        }
    }
}, {
    decorations: v => v.decorations
});

export default (_context) => {
    return {
        assets: () => [{ name: 'style.css' }],
        plugin: (codeMirrorWrapper) => {
            codeMirrorWrapper.addExtension(collapsibleEditorColorsPlugin);
        }
    };
};
import { Decoration, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

export default (context) => {
    return {
        assets: () => [{ name: 'style.css' }],
        plugin: async (codeMirrorWrapper) => {
            const settings = await context.postMessage({ name: 'getSettings', data: {} });
            const { doEditorColors, startToken, endToken } = settings;

            // Defines a CodeMirror view plugin that updates decorations on relevant changes
            const collapsibleEditorColorsPlugin = ViewPlugin.fromClass(
                class {
                    constructor(view) {
                        this.decorations = findCollapsibles(view, startToken, endToken, doEditorColors);
                    }
                    update(update) {
                        if (update.docChanged || update.viewportChanged) {
                            this.decorations = findCollapsibles(update.view, startToken, endToken, doEditorColors);
                        }
                    }
                },
                {
                decorations: v => v.decorations
                }
            );

            // Finds valid collapsible blocks in the editor, marks which lines in the editor are part of these blocks
            function findCollapsibles(view) {
                // lines will contain every line number that is part of a collapsible block
                // lines which are in nested blocks will appear multiple times - this is desired
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
                    // This line starts with our startToken
                    if (line.endsWith(endToken)) {
                        // And ends with it - it's a valid block spanning only this line
                        lines.push(i);
                        continue;
                    }
                    // Look for the matching endToken
                    let startLine = i,
                        endLine;
                    for (let j = i + 1, nestedBlocks = 0; j <= doc.lines; j++) {
                        // The j-th line without leading whitespace
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
                        // We did find a matching endline, this is a valid block
                        // Add all of its line numbers to lines
                        for (let j = startLine; j <= endLine; j++) {
                            lines.push(j);
                        }
                    }
                }
                // After identifying all line numbers, send here to add classes to them so CSS properties may be applied
                addClassToLines(view, builder, lines);
                return builder.finish();
            }

            // Adds classes to lines in the editor to mark them as being part of a collapsible block
            // If doing editor colors, it will also add a class denoting its nesting level
            function addClassToLines(view, builder, lines) {
                if (lines.length === 0) {
                    return;
                }
                // lines is an array of line numbers which are part of a collapsible block section
                // A line which is in a nested collapsible block will appear in the array once per block
                // So the nesting level is the number of times a line number appears in lines

                // Sort lines
                lines.sort((a, b) => a - b);

                // We will convert lines from something like this:
                // [1, 2, 3, 3, 3, 3, 4, 4, 6, 9, 9, 9]
                // to something like this: 
                // [[1, 1], [2, 1], [3, 4], [4, 2], [6, 1], [9, 3]]
                // where each entry is [n, nCount] for each n in the original lines
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
                    // Only support 8 different colors, after which we wrap around - also index from 0
                    nCount = (nCount - 1) % 8;
                    const from = view.state.doc.line(n).from;
                    let classes;
                    if (doEditorColors) {
                        classes = `cb cb-nest-${nCount}`;
                    } else {
                        classes = 'cb';
                    }
                    builder.add(from, from, Decoration.line({ class: classes }));
                }
            }

            // Add the extension
            codeMirrorWrapper.addExtension(collapsibleEditorColorsPlugin);
        }
    };
};
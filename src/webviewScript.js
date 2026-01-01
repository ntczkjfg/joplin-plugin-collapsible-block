export default (context) => {
    return {
        plugin: async function(markdownIt, options) {
            const settings = {
                doWebviewColors: options.settingValue('doWebviewColors'),
                startToken: options.settingValue('startToken'),
                endToken: options.settingValue('endToken'),
                headingsCollapsible: options.settingValue('headingsCollapsible'),
                darkMode: options.settingValue('darkMode'),
                pluginId: context.pluginId,
            };
            // This one comes as a JSON.stringify string
            settings['collapsibleList'] = JSON.parse(options.settingValue('collapsibleList'));

            const headingRuleObj = markdownIt.block.ruler.__rules__.find(r => r.name === 'heading');
            //for (const rule of markdownIt.block.ruler.__rules__) console.error(rule.name);
            let headingRule = headingRuleObj?.fn;
            if (headingRule !== undefined && settings.headingsCollapsible) {
                // Replace the built-in heading rule with our rule that does the same thing but makes them collapsible
                function collapsibleHeaderWrapper(state, start, end, silent) {
                    return collapsibleHeader(state, start, end, silent, settings, headingRule);
                }
                markdownIt.block.ruler.at('heading',
                                          collapsibleHeaderWrapper,
                                          { alt: ['paragraph', 'reference', 'blockquote'] });
            }
            function collapsibleBlockWrapper(state, start, end, silent) {
                 return collapsibleBlock(state, start, end, silent, settings);
            }
            markdownIt.block.ruler.before('code',
                                          'collapsibleBlock',
                                          collapsibleBlockWrapper,
                                          { alt: ['paragraph', 'reference', 'blockquote'] });
        },
        assets: () => { return [ { name: 'style.css' } ]; }
    };
}

let collapsibleList;
let lastStartHeading = 0;

function collapsibleHeader(state, start, end, silent, settings, headingRule) {
    let { pluginId, startToken, endToken } = settings;
    if (!silent) {
        if (start < lastStartHeading) {
            // First time running, or starting over
            collapsibleList = undefined;
        }
        lastStartHeading = start;
    }
    if (!collapsibleList) collapsibleList = settings.collapsibleList;
    if (!collapsibleList || Object.keys(collapsibleList).length === 0) {
        collapsibleList = buildCollapsibleList(state.src, startToken, endToken);
    }

    let widget;
    for (const wid of Object.values(collapsibleList)) {
        if (wid.lineNum === start) {
            widget = wid;
            break;
        }
    }
    if (!widget || !widget.heading) return false;
    let pos = state.bMarks[start] + state.tShift[start];
    let max = state.eMarks[start];
    let line = state.src.slice(pos, max);
    const match = line.match(/^ {0,3}(#{1,6})([ \t](.*?)$|$)/);
    if (!match) return false; // Sanity check, shouldn't ever happen by this point
    if (silent) return true;
    const level = match[1].length;
    const title = match[2].replace(/^[ \t]/, '');
    let openFlag;
    if (widget.webviewFolded) {
        openFlag = [ 'closed', '' ];
    } else {
        openFlag = [ 'open', '' ];
    }
    let nextLine = widget.lineNumEnd;

    let token = state.push('details_open', 'details', 1);
    // ontoggle sends message to index.ts, which modifies the editor to mark the block as opened or closed
    token.attrs = [[ 'class', 'cb-heading' ],
                   [ 'ontoggle',   `if ((this.open !== !this.hasAttribute('closed')) || this.hasAttribute('debounce')) {
                                        webviewApi.postMessage('${pluginId}', { name: 'collapsibleToggle',
                                                                                data: { isFolded: !this.open,
                                                                                        lineNum: ${state.line + 1},
                                                                                        id: '${widget.id}',
                                                                                      }
                                                                              }
                                        );
                                        this.setAttribute('debounce', '');
                                    }` ],
                   openFlag];
    state.push('summary_open', 'summary', 1);

    const token_o  = state.push('heading_open', 'h' + String(level), 1);
    token_o.markup = '########'.slice(0, level);
    token_o.map    = [start, state.line];

    const token_i    = state.push('inline', '', 0);
    token_i.content  = title;
    token_i.map      = [start, state.line];
    token_i.children = [];

    const token_c  = state.push('heading_close', 'h' + String(level), -1);
    token_c.markup = '########'.slice(0, level);

    state.push('summary_close', 'summary', -1);

    state.md.block.tokenize(state, start + 1, nextLine) // Includes start + 1, does not include nextLine
    state.push('details_close', 'details', -1);
    if (nextLine === start) nextLine++;
    state.line = nextLine;
    return true;
}

// These two used for tracking previously found collapsible blocks
// for the purpose of determining nesting levels
let foundBlocks = [];
let lastStart = 0;
// Tokenizing the collapsible blocks
function collapsibleBlock(state, start, end, silent, settings) {
    const { startToken, endToken, doWebviewColors, darkMode, collapsibleList, pluginId } = settings;
    if (!startToken || !endToken || !collapsibleList) {
        return false
    }
    if (!silent) {
        if (foundBlocks === undefined || start < lastStart) {
            // First time running, or starting over
            foundBlocks = [];
        }
        lastStart = start;
    }
    let pos = state.bMarks[start] + state.tShift[start],
        max = state.eMarks[start];
    // Check if the line is too short
    if (pos + startToken.length > max) return false;
    // Check if the line doesn't start with startToken
    if (state.src.slice(pos, pos + startToken.length) !== startToken) return false;
    pos += startToken.length;

    let found       = false, // If we've "found" the matching endToken
        currentLine = start, // The line we're currently looking at
        title              , // The title of the collapsible
        bodyEndLine        , // The line number of the last line of the body of the collapsible
        lastLine    = false, // Whether the endToken is on the same line as the last line of body text or not
        endLine            ; // The line endToken appears on

    if (state.src.slice(max - endToken.length, max) === endToken) {
        // endToken is on same line as startToken - set the title, and we have no body
        title = state.src.slice(pos, max - endToken.length);
        if (title.endsWith(endToken)) {
            title = state.src.slice(pos, max - 2*endToken.length);
        }
        endLine = start;
    } else {
        if (pos !== max) {
            // There's more on the same line as startToken - that's our title!
            title = state.src.slice(pos, max)
        }
        currentLine++;
        // Look for endToken, but account for extra startTokens we see along the way
        for (let nestedBlocks = 0; currentLine < end; currentLine++) {
            pos = state.bMarks[currentLine] + state.tShift[currentLine];
            max = state.eMarks[currentLine];
            if (state.src.slice(pos, pos + startToken.length) === startToken) {
                // Found a nested startToken
                nestedBlocks++;
            }
            if (state.src.slice(max - endToken.length, max) === endToken) {
                if (nestedBlocks === 0) {
                    // Found the correct ending
                    found = true;
                    endLine = currentLine;
                    if (currentLine > start + 1) {
                        // body will include all lines up to but not including the line with endToken
                        bodyEndLine = currentLine - 1;
                    }
                    let content = state.src.slice(pos, max);
                    if (content !== endToken & content !== endToken + endToken) {
                        // There is body content on the same line as endToken - include it
                        bodyEndLine = currentLine;
                        lastLine = true;
                    }
                    break;
                } else {
                    // Found ending for a nested block - keep looking
                    nestedBlocks--;
                    continue
                }
            }
        }
        if (!found) {
            // endToken not found
            return false;
        }
    }
    if (silent) {
        return true;
    }
    let widget;
    for (const wid of Object.values(collapsibleList)) {
        if (wid.lineNum === start) {
            widget = wid;
            break;
        }
    }
    if (widget === undefined) {
        //console.error('Undefined block');
        widget = {
            id: Math.random().toString(36).slice(2),
            lineNum: start,
            isFolded: (title === undefined || !title.startsWith(startToken)),
            doUpdate: (state.src.slice(state.eMarks[endLine] - 2 * endToken.length, state.eMarks[endLine]) !== endToken + endToken),
            webviewFolded: (title === undefined || !title.startsWith(startToken)),
            editorFolded: (title === undefined || !title.startsWith(startToken)),
            heading: false,
        };
    }
    // Add to foundBlocks, calculate nesting level
    foundBlocks.push([start, endLine]);
    let nestingLevel = 0;
    for (let i = 0; i < foundBlocks.length; i++) {
        if (foundBlocks[i][0] < start && foundBlocks[i][1] > endLine) {
            nestingLevel++;
        }
    }
    // Mod 8 because that's how many colors we support
    nestingLevel = nestingLevel % 8;
    if (title !== undefined && title.startsWith(startToken)) title = title.slice(startToken.length);
    // openFlag determines if the block displays opened or closed by default
    let openFlag;
    if (widget.webviewFolded) {
        openFlag = [ 'closed', '' ];
    } else {
        openFlag = [ 'open', '' ];
    }
    // noToggleFlag determines if opening or closing the block will save its state
    let noToggleFlag = false;
    if (state.src.slice(state.eMarks[endLine] - 2 * endToken.length, state.eMarks[endLine]) === endToken + endToken) {
        noToggleFlag = true;
    }
    let token;
    token = state.push('details_open', 'details', 1);
    let classes = 'cb-details';
    if (darkMode) classes += ' cb-dark';
    else classes += ' cb-light';
    if (doWebviewColors) classes += ` cb-nest-${nestingLevel}`;
    // ontoggle sends message to index.ts, which modifies the editor to mark the block as opened or closed
    token.attrs = [[ 'class', classes ],
                   [ 'ontoggle',   `if ((this.open !== !this.hasAttribute('closed')) || this.hasAttribute('debounce')) {
                                        webviewApi.postMessage('${pluginId}', { name: 'collapsibleToggle',
                                                                                data: { isFolded: !this.open,
                                                                                        lineNum: ${state.line},
                                                                                        id: '${widget.id}',
                                                                                      }
                                                                              }
                                        );
                                        this.setAttribute('debounce', '');
                                    }` ],
                   openFlag];
    state.push('summary_open', 'summary', 1);
    // Set the summary
    if (title !== undefined) {
        token = state.push('inline', '', 0);
        token.content = title;
        token.children = [];
    }
    state.push('summary_close', 'summary', -1);
    // Set the content
    if (bodyEndLine !== undefined) {
        state.md.block.tokenize(state, start + 1, bodyEndLine + 1);
    }
    // This entire for loop just removes code blocks, which are sometimes created against my will while indenting
    for (let i = 1; state.tokens[state.tokens.length - i].type !== 'summary_close'; i++) {
        if (state.tokens[state.tokens.length - i].type === 'code_block') {
            const code_token = state.tokens[state.tokens.length - i];
            const end_tokens = [];
            for (let j = 1; j <= i; j++) {
                end_tokens.push(state.tokens.pop());
            }
            end_tokens.pop();
            let token = state.push('inline', '', 0);
            token.content = code_token.content.slice(0, -1); // An ending linebreak is automatically added to code blocks, remove it
            token.children = [];
            while (end_tokens.length > 0) {
                state.tokens.push(end_tokens.pop());
            }
        }
    }
    // After maybe adding the body above, check the final token
    if (state.tokens[state.tokens.length - 1].type === 'summary_close') {
        // If no body, add a blank line
        // That way it can at least expand to show it's empty
        // Looks vaguely buggy otherwise
        token = state.push('inline', '', 0);
        token.content = '\n';
        token.children = [];
    }
    if (lastLine) {
        // The last line of the body also includes endToken - let's remove it from the relevant token
        // Last token is usually a paragraph_close, token we want is usually penultimate one, but I've
        // seen it be as late as the 4th-from-last. Checking up to last 8 tokens just in case of 
        // situations I didn't encounter
        for (let i = 1; i <= 8; i++) {
            let token = state.tokens[state.tokens.length - i];
            if (token.type === 'inline' && token.content.endsWith(endToken)) {
                if (!noToggleFlag) {
                    token.content = token.content.slice(0, -endToken.length);
                } else {
                    // The end token was doubled - remove both of them
                    token.content = token.content.slice(0, -2*endToken.length);
                }
                break;
            }
        }
    }
    state.push('details_close', 'details', -1);
    state.line = currentLine + 1;
    return true;
}

// Creates a doc-like object (with just the properties we need) from state.src
function makeDocFromSrc(src) {
    const lines = src.split('\n');
    const lineStarts = new Array(lines.length);

    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
        lineStarts[i] = offset;
        offset += lines[i].length + 1; // '\n'
    }

    function lineAt(pos) {
        // Find the last lineStart <= pos
        // Linear scan is fine; can be binary if needed
        let index = 0;
        for (let i = 0; i < lineStarts.length; i++) {
            if (lineStarts[i] > pos) break;
            index = i;
        }
        return { number: index + 1 };
    }

    return {
        lines: lines.length,
        length: src.length,

        line(n) {
            if (n < 1 || n > lines.length) {
                throw new RangeError(`Invalid line number: ${n}`);
            }

            const index = n - 1;
            const text = lines[index];
            const from = lineStarts[index];
            const to = from + text.length;

            return { text, from, to };
        },

        lineAt,
    };
}

function buildCollapsibleList(src, startToken, endToken) {
    const doc = makeDocFromSrc(src);
    const settings = { startToken, endToken };
    function processLines(doc) {
        const { startToken, endToken } = settings;
        const regions = [];
        let inCodeBlock = false;
        let codeBlockChar = '';
        let codeBlockLen = 0;
        const headings = [];
        // Below are unused for now but planning to use later
        function escapeForRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        const startTokenRegex = new RegExp('^[ \t]*((?:' + escapeForRegex(startToken) + '){1,2})');
        let match;

        for (let i = 1; i <= doc.lines; i++) { // doc.lines indexes from 1
            const line = doc.line(i).text;
            if (!inCodeBlock) {
                match = line.match(/^ {0,3}([`~]{3,})/);
                if (match) {
                    inCodeBlock = true;
                    codeBlockChar = match[1][0];
                    codeBlockLen = match[1].length;
                    continue;
                }
            } else {
                match = line.match(new RegExp(`^ {0,3}${codeBlockChar}{${codeBlockLen},}$`));
                if (match) {
                    inCodeBlock = false;
                    codeBlockChar = '';
                    codeBlockLen = 0;
                }
                continue;
            }

            // Headings! Starts with 0-3 spaces, then 1-6 #s, then a space or tab then anything else - can also end immediately after the #s
            match = line.match(/^ {0,3}(#{1,6})([ \t](.*?)$|$)/);
            if (match) {
                let foldFrom = doc.line(i).to;
                if (doc.line(i).text.endsWith(' ')) foldFrom--;
                const heading = {
                    lineNum: i - 1,
                    order: match[1].length,
                    from: doc.line(i).from,
                    to: foldFrom,
                    isFolded: line.endsWith(' '),
                    startFrom: doc.line(i).from + line.indexOf('#'),
                    startTo: doc.line(i).from + line.indexOf('#') + match[1].length,
                };
                headings.push(heading);
                continue;
            }

            // Start looking for user-defined collapsible blocks now
            match = line.match(startTokenRegex);
            if (!match) continue; // Not the start of a block, make no changes to levels

            const isFolded = match[1].length !== 2*startToken.length; // Start token is doubled
            // This line starts with our startToken
            if (line.endsWith(endToken)) continue; // And ends with it - nothing to collapse
            // Look for the matching endToken
            let endLine;
            let endTokenLen;
            for (let j = i + 1, nestedBlocks = 0; j <= doc.lines; j++) {
                const lineJ = doc.line(j).text;
                if (startTokenRegex.test(lineJ)) {
                    nestedBlocks++;
                }
                if (lineJ.endsWith(endToken)) {
                    if (nestedBlocks === 0) {
                        endLine = j;

                        if (lineJ.endsWith(endToken + endToken)) endTokenLen = 2 * endToken.length;
                        else endTokenLen = endToken.length
                        break;
                    }
                    nestedBlocks--;
                }
            }
            if (endLine) {
                const startFrom = doc.line(i).from + line.indexOf(startToken);
                const startTo = startFrom + (isFolded ? startToken.length : 2*startToken.length);
                regions.push({
                    isFolded: isFolded,
                    startFrom: startFrom,
                    startTo: startTo,
                    foldFrom: doc.line(i).to,
                    foldTo: doc.line(endLine).to - endTokenLen,
                    endTo: doc.line(endLine).to,
                    doUpdate: endTokenLen === endToken.length,
                    lineNum: i - 1,
                    heading: false,
                });
            }
        }
        // Add the headings to regions now that we have all of them
        for (const heading of headings) {
            const region = {
                isFolded: heading.isFolded,
                startFrom: heading.startFrom,
                startTo: heading.startTo,
                foldFrom: heading.to,
                doUpdate: true,
                lineNum: heading.lineNum,
                heading: true,
            };
            // Find next heading of equal or higher precedence
            let nextHeading = null;
            for (const candidate of headings) {
                if (candidate.lineNum > heading.lineNum && candidate.order <= heading.order) {
                    // Next heading is invalid if it's contained within this plugin's collapsible blocks
                    const invalid = regions.some(r =>
                        !r.heading &&
                        r.startFrom > region.startFrom &&
                        r.startFrom < candidate.startFrom &&
                        r.endTo > candidate.startFrom
                    );
                    if (!invalid) {
                        nextHeading = candidate;
                        break;
                    }
                }
            }
            if (nextHeading) {
                region.foldTo = nextHeading.from - 1;
                region.endTo  = nextHeading.from - 1;
            } else {
                region.foldTo = doc.length;
                region.endTo  = doc.length;
            }
            // Find if this heading is contained within a collapsible block from this plugin
            const overlappingRegion = regions.find(r =>
                !r.heading &&
                r.startFrom < heading.startFrom &&
                r.endTo > heading.startFrom
            );
            // If it is, then don't let the collapsible region under this heading extend past the end of the block
            if (overlappingRegion) {
                // The line number the collapsible block ends on
                const lineIndex = doc.lineAt(overlappingRegion.endTo).number;
                // The end of the line before that
                const cap = doc.line(lineIndex - 1).to;
                region.foldTo = Math.min(region.foldTo, cap);
                region.endTo  = Math.min(region.endTo, cap);
            }
            regions.push(region);
        }
        return regions;
    }
    const regions = processLines(doc);
    const collapsibleList = {};
    for (const region of regions) {
        const id = Math.random().toString(36).slice(2);
        collapsibleList[id] = {
            id: id,
            doUpdate: region.doUpdate,
            isFolded: region.isFolded,
            lineNum: region.lineNum,
            lineNumEnd: doc.lineAt(region.endTo).number,
            webviewFolded: region.isFolded,
            editorFolded: region.isFolded,
            heading: region.heading ?? false,
        };
    }
    return collapsibleList;
}
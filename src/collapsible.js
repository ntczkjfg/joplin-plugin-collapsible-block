module.exports =  {
    default: function(context) {
        const pluginId = context.pluginId;
        return {
            plugin: async function(markdownIt, options) {
                const doWebviewColors = options.settingValue('doWebviewColors'),
                      startToken = options.settingValue('startToken'),
                      endToken = options.settingValue('endToken');
                // Before code or else it doesn't work nicely with indentation
                markdownIt.block.ruler.before('code',
                                              'collapsibleBlock',
                                              function (state, start, end, silent) {
                                                  return collapsibleBlock(state, start, end, silent, startToken, endToken, pluginId, doWebviewColors);
                                              });
                // This entire rule just exists to make indentation errors more forgiving
                // When a valid collapsible block would otherwise get swallowed up by the
                // paragraph rule due to excessive indentation, this stops it from being swallowed
                markdownIt.block.ruler.before('paragraph',
                                              'excessivelyIndentedCollapsibleBlock',
                                              function (state, start, end, silent) {
                                                  return excessivelyIndentedCollapsibleBlock(state, start, end, silent, startToken, endToken, pluginId, doWebviewColors);
                                              },
                                              { alt: [ 'paragraph' ] });
            },
            assets: () => {
                return [ { name: 'style.css' } ];
            }
        };
    }
};

// If collapsible blocks are being indented for formatting, they sometimes get swallowed by the paragraph rule
// This simply runs before the paragraph rule to identify situations where we'd like the collapsible block rule to win instead
function excessivelyIndentedCollapsibleBlock(state, start, end, silent, startToken, endToken, pluginId, doWebviewColors) {
    let nextLine = start + 1;
    let success = false;
    for (; nextLine < end && !state.isEmpty(nextLine); nextLine++) {
        if (collapsibleBlock(state, nextLine, end, true, startToken, endToken, pluginId, doWebviewColors)) {
            success = true
            break
        }
    }
    if (!success) {
        return false;
    }
    if (silent) {
        return true;
    }
    state.md.block.tokenize(state, start, nextLine);
    state.line = nextLine
    return collapsibleBlock(state, nextLine, end, false, startToken, endToken, pluginId, doWebviewColors)
}

// These two used for tracking previously found collapsible blocks
// for the purpose of determining nesting levels
let foundBlocks;
let lastStart = 0;
// Tokenizing the collapsible blocks
function collapsibleBlock(state, start, end, silent, startToken, endToken, pluginId, doWebviewColors) {
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
                    if (pos < max - endToken.length) {
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
    // openFlag determines if the block displays opened or closed by default
    let openFlag;
    if (title !== undefined && title.startsWith(startToken)) {
        // This happens if the startToken is doubled - which is how we indicate
        // a block should display as open. Remove the token from the title and 
        // set openFlag to mark the block as open
        title = title.slice(startToken.length);
        openFlag = [ 'open', '' ];
    } else {
        // Block is closed
        // putting 'closed' in the tag doesn't actually do anything - they're closed by default
        // But I use it in the ontoggle call to only postMessage when it's actually relevant
        openFlag = [ 'closed', '' ];
    }
    token = state.push('details_open', 'details', 1);
    let classes;
    if (doWebviewColors) {
        classes = `cb-details cb-nest-${nestingLevel}`;
    } else {
        classes = 'cb-details';
    }
    // ontoggle sends message to index.ts, which modifies the editor to mark the block as opened or closed
    token.attrs = [[ 'class', classes ],
                   [ 'ontoggle',   `if ((this.open !== !this.hasAttribute('closed')) || this.hasAttribute('debounce')) {
                                        webviewApi.postMessage('${pluginId}', { name: 'collapsibleToggle', data: { isOpen: this.open, lineNum: ${state.line} } });
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
        // Calculate the block indent as the smallest indent level present on any body line
        let blkIndent = 99999;
        for (let i = start + 1; i <= bodyEndLine; i++) {
            if (state.sCount[i] >= blkIndent) {
                continue;
            }
            if (state.isEmpty(i)) { // Ignore empty lines
                continue;
            }
            blkIndent = state.sCount[i];
        }
        // Send the body to be tokenized, then restore the old value of state.blkIndent
        const old_blkIndent = state.blkIndent;
        try {
            state.blkIndent = blkIndent
            state.md.block.tokenize(state, start + 1, bodyEndLine + 1);
        } finally {
            state.blkIndent = old_blkIndent;
        }
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
        // Last token is usually a paragraph_close, token we want is usually penultimate one
        // Checking up to last 3 tokens just in case of situations I didn't encounter
        for (let i = 1; i < 4; i++) {
            let token = state.tokens[state.tokens.length - i];
            if (token.type === 'inline') {
                token.content = token.content.slice(0, -endToken.length);
                break;
            }
        }
    }
    state.push('details_close', 'details', -1);
    state.line = currentLine + 1;
    return true;
}
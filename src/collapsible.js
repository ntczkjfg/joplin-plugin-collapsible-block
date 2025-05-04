const config = require('./config.json');

module.exports =  {
    default: function(context) {
        const startToken = ':{',
              endToken   = '}:',
              pluginId = context.pluginId;
        return {
            plugin: async function(markdownIt, options) {
                markdownIt.block.ruler.before(markdownIt.block.ruler.__rules__[0].name,
                                              'collapsibleBlock',
                                              function (state, start, end, silent) {
                                                  return collapsibleBlock(state, start, end, silent, startToken, endToken, pluginId);
                                              }),
                // This entire rule just exists to make indentation errors more forgiving
                // When a valid collapsible block would otherwise get swallowed up by the
                // paragraph rule due to excessive indentation, this stops it from being swallowed
                markdownIt.block.ruler.before('paragraph',
                                              'excessivelyIndentedCollapsibleBlock',
                                              function (state, start, end, silent) {
                                                  return excessivelyIndentedCollapsibleBlock(state, start, end, silent, startToken, endToken, pluginId);
                                              },
                                              { alt: [ 'paragraph' ] });
            },
            assets: () => {
                return [ { name: 'style.css' } ];
            }
        };
    },
    openOrCloseBlock
};

function excessivelyIndentedCollapsibleBlock(state, start, end, silent, startToken, endToken, pluginId) {
    let nextLine = start + 1;
    let success = false;
    for (; nextLine < end && !state.isEmpty(nextLine); nextLine++) {
        if (collapsibleBlock(state, nextLine, end, true, startToken, endToken, pluginId)) {
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
    return collapsibleBlock(state, nextLine, end, false, startToken, endToken, pluginId)
}

// Modifies the editor to indicate whether a block should be open or closed
// Two copies of startToken indicate a block should be open, one copy closed
async function openOrCloseBlock(joplin, startToken, messages) {
    let lineNums = [];
    const note = await joplin.workspace.selectedNote();
    let   lines   = note.body.split('\n'); // Split note body into lines
    for (let i = messages.length - 1; i > -1; i--) {
        const isOpen  = messages[i].isOpen,
              lineNum = messages[i].lineNum;
              noteId  = messages[i].noteId; // Correct note ID
        if (noteId !== note.id) {
            continue;
        }
        if (lineNums.includes(lineNum)) continue;
        lineNums.push(lineNum);
        // Get the line
        let line = lines[lineNum];

        // Doesn't contain startToken? Should never happen
        if (!line.includes(startToken)) continue;
        // In case there's leading spaces
        let startPos = line.indexOf(startToken);
        if (isOpen) {
            // block is open, so try to double startToken
            if (line.length === startPos + startToken.length) {
                // line is just startToken, so append another startToken to it
                line += startToken;
            } else {
                // line has more than just startToken. If it's already doubled, continue
                if (line.slice(startPos + startToken.length, startPos + 2*startToken.length) === startToken) continue;
                // otherwise, splice it in. 
                line = line.slice(0, startPos) + startToken + line.slice(startPos);
            }
        } else {
            // block is closed, make sure startToken is not doubled
            if (line.slice(startPos + startToken.length, startPos + 2*startToken.length) === startToken) {
                // startToken is doubled - remove the first copy
                line = line.slice(0, startPos) + line.slice(startPos + startToken.length);
            } else continue;
        }
        // Replace line lineNum
        lines[lineNum] = line;
    }
    const updatedBody = lines.join('\n');

    // Update the note
    await joplin.data.put(['notes', note.id], null, { body: updatedBody });
}

let foundBlocks;
let lastStart = 0;

// Tokenizing the collapsible blocks
function collapsibleBlock(state, start, end, silent, startToken, endToken, pluginId) {
    if (!silent) {
        if (foundBlocks === undefined || start < lastStart) {
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
    foundBlocks.push([start, endLine]);
    let nestingLevel = 0;
    for (let i = 0; i < foundBlocks.length; i++) {
        if (foundBlocks[i][0] < start && foundBlocks[i][1] > endLine) {
            nestingLevel++;
        }
    }
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
    if (config.doWebviewColors) {
        classes = `cb-details cb-nest-${nestingLevel}`;
    } else {
        classes = 'cb-details';
    }
    // ontoggle sends message to index.ts, which calls openOrCloseBlock above
    token.attrs = [[ 'class', classes ],
                   [ 'ontoggle',   `if ((this.open !== !this.hasAttribute('closed')) || this.hasAttribute('debounce')) {
                                        webviewApi.postMessage('${pluginId}', { isOpen: this.open, lineNum: ${state.line} });
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
        let blkIndent = 99999;
        for (let i = start + 1; i <= bodyEndLine; i++) {
            if (state.sCount[i] >= blkIndent) {
                continue;
            }
            if (!state.isEmpty(i)) {
                blkIndent = Math.min(blkIndent, state.sCount[i]);
            }
        }
        const old = state.blkIndent;
        try {
            state.blkIndent = blkIndent
            state.md.block.tokenize(state, start + 1, bodyEndLine + 1);
        } finally {
            state.blkIndent = old;
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
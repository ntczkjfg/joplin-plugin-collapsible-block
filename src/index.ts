import joplin from 'api';
import { ContentScriptType, ToolbarButtonLocation, SettingItemType, ModelType } from 'api/types';

joplin.plugins.register({
    onStart: async function() {
        // Create the settings page
        await joplin.settings.registerSection('collapsibleBlocks', {
            label: 'Collapsible Blocks',
            description: 'Collapsible Blocks Plugin Settings',
            iconName: 'fas fa-angle-right'
        });
        const isMobile = (await joplin.versionInfo()).platform === 'mobile';
        const darkMode = await joplin.shouldUseDarkColors();
        await joplin.settings.registerSettings({
            doEditorColors: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: false,
                label: 'Color blocks in the editor',
                description: 'Color collapsible block text in the editor. If blocks are nested, each nesting layer is a different color.',
            },
            doWebviewColors: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: false,
                label: 'Color blocks in the webview',
                description: `Color the border of collapsible blocks in the webview to match the editor’s text color, if editor colors are enabled. Useful when making edits to heavily nested groups of blocks.`,
            },
            startToken: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.String,
                value: ':{', // Default start token
                label: 'Start Token',
            },
            endToken: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.String,
                value: '}:', // Default end token
                label: 'End Token',
            },
            blocksRemember: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: true,
                label: 'Remember when collapsible blocks are left opened or closed in the webview',
                description: `If disabled, opening or closing collapsible blocks in the webview will not change their state in the editor, which will cause them to always display as opened or closed, depending on their state in the editor, when a note is reloaded. You can also do this on a case-by-case basis by doubling the end token for a given block.`,
            },
            indentLevel: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Int,
                value: 15,
                minimum: 0,
                maximum: 100,
                step: 1,
                label: 'Editor Block indentation level',
                description: 'How much to visually indent collapsible section bodies in the editor (0 for none). Unitless, but 10 is roughly equivalent to one tab.',
            },
            maxIndentLevel: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Int,
                value: 8,
                minimum: 0,
                maximum: 100,
                step: 1,
                label: '',
                description: 'How many nested layers of collapsible blocks to apply the above indentation level to, before maxing out.',
            },
            collapsibleInEditor: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: true,
                label: 'Allow collapsing blocks within the markdown editor as well.',
                description: 'The below options won\'t do anything if this isn\'t checked',
            },
            lockEditorAndWebview: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: true,
                label: 'Keep editor and webview folding in sync',
                description: `When a collapsible section is opened or closed in either the editor or webview, the corresponding section in the other view will update automatically. If the option to remember states is turned off, then opening or closing collapsibles in the editor will not be able to immediately sync to the webview in split mode.`,
            },
            headingsCollapsible: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: true,
                label: 'Enable heading-based collapsing in the webview',
                description: 'Headings will make everything beneath them, until the next heading of equal or higher priority, collapsible',
            },
            headingsCollapsibleEditor: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: true,
                label: 'Enable heading-based collapsing in the editor',
                description: '',
            },
            headingsRemember: {
                section: 'collapsibleBlocks',
                public: true,
                type: SettingItemType.Bool,
                value: true,
                label: 'Remember when collapsible headings are left opened or closed',
                description: 'If disabled, headings will always be initially opened',
            },
            isMobile: {
                section: 'collapsibleBlocks',
                public: false,
                type: SettingItemType.Bool,
                value: isMobile,
                label: 'isMobile',
            },
            darkMode: {
                section: 'collapsibleBlocks',
                public: false,
                type: SettingItemType.Bool,
                value: darkMode,
                label: 'darkMode',
            },
            collapsibleList: {
                section: 'collapsibleBlocks',
                public: false,
                type: SettingItemType.String,
                value: '{}',
                label: 'collapsibleList'
            }
        });
        let lockEditorAndWebview,
            blocksRemember,
            headingsRemember,
            startToken,
            endToken;
        async function updateSettings() {
            [
                lockEditorAndWebview,
                blocksRemember,
                headingsRemember,
                startToken,
                endToken,
            ] = await Promise.all([
                joplin.settings.value('lockEditorAndWebview'),
                joplin.settings.value('blocksRemember'),
                joplin.settings.value('headingsRemember'),
                joplin.settings.value('startToken'),
                joplin.settings.value('endToken'),
            ]);
        }
        await updateSettings();
        await joplin.settings.onChange(async (event) => {
            for (const key of event.keys) {
                if (key !== 'collapsibleList') {
                    await updateSettings();
                    updateEditor(isMobile);
                    return;
                }
            }
        });

        let collapsibleList: any = {};
        const note = await joplin.workspace.selectedNote();
        let noteId;
        if (note) noteId = note.id;
        joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
        await joplin.workspace.onNoteSelectionChange(async (event) => {
            // Detects when the note is changed
            // editor script also does this, but doing it here too lets
            // the editor avoid an async call and sends the blank list to
            // the webview script faster
            if (event.value && event.value.length) noteId = event.value[0];
            collapsibleList = {};
            await joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
        });

        // Create a toolbar button
        await joplin.commands.register({
            name: 'insertCollapsibleBlock',
            label: 'Collapsible block',
            iconName: 'fas fa-angle-right', // >
            execute: async () => {
                const selectedText = (await joplin.commands.execute('selectedText') as string);
                let content = selectedText.split('\n');
                if (content.length == 1 && content[0] !== '') {
                    if (!content[0].startsWith(startToken)) {
                        // Just a title
                        await joplin.commands.execute('replaceSelection',`\n${startToken}${startToken}${content[0]}\n\n${endToken}\n`);
                    } else {
                        // content is another collapsible block - make it the body
                        await joplin.commands.execute('replaceSelection',`\n${startToken}${startToken}\n${content[0]}\n${endToken}\n`);
                    }
                } else if (content.length > 1) {
                    if (!content[0].startsWith(startToken)) {
                        // Title and body!
                        await joplin.commands.execute('replaceSelection',`\n${startToken}${startToken}${content[0]}\n${content.slice(1).join('\n')}\n${endToken}\n`);
                    } else {
                        // content is another block - make it all body
                        await joplin.commands.execute('replaceSelection',`\n${startToken}${startToken}\n${content.join('\n')}\n${endToken}\n`);
                    }
                } else {
                    // No title or body, make our own
                    await joplin.commands.execute('insertText',`\n${startToken}${startToken}Title\nBody\n${endToken}\n`);
                }
            },
            enabledCondition: 'markdownEditorPaneVisible && !richTextEditorVisible'
        });
        // Add it to the toolbar
        await joplin.views.toolbarButtons.create('insertCollapsibleBlock', 'insertCollapsibleBlock', ToolbarButtonLocation.EditorToolbar);

        // The webview plugin
        const webScriptId = 'joplin.plugin.collapsible.blocks';
        await joplin.contentScripts.register(
            ContentScriptType.MarkdownItPlugin,
            webScriptId,
            'webviewScript.js'
        );
        // When a collapsible section is opened or closed, it sends a message here
        // This then calls a function to modify the editor to save that change
        await joplin.contentScripts.onMessage(webScriptId, async (message: { name: string, data: { [key: string]: any } }) => {
            switch (message.name) {
                case 'collapsibleToggle':
                	let collapsible;
                    const { id, isFolded, lineNum } = message.data;
                    if (id in collapsibleList) {
                    	collapsible = collapsibleList[id];
                        if (blocksRemember) {
                            collapsibleList[id].isFolded = isFolded;
                        }
                        if (lockEditorAndWebview) {
                            collapsibleList[id].editorFolded = isFolded;
                        }
                        collapsibleList[id].webviewFolded = isFolded;
                    } else {
                        for (const widget of Object.values(collapsibleList)) {
                            if (widget['lineNum'] === lineNum) {
                            	collapsible = widget;
                                if (blocksRemember) {
                                    widget['isFolded'] = isFolded;
                                }
                                if (lockEditorAndWebview) {
                                    widget['editorFolded'] = isFolded;
                                }
                                widget['webviewFolded'] = isFolded;
                                break;
                            }
                        }
                    }
                    if (!collapsible) collapsible = { lineNum: lineNum, isFolded: isFolded };
                    joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
                    // Forces the editor to update even though nothing changed
                    // Moreso, does so in a way we can detect
                    if (isMobile) modifyEditor(collapsible, noteId, startToken)
                    else updateEditor(isMobile);
                    break;
                default:
                    break;
            }
        });

        // The editor plugin
        const editorScriptId = 'joplin.plugin.collapsible.blocks.editor';
        // Register the CodeMirror content script
        await joplin.contentScripts.register(
            ContentScriptType.CodeMirrorPlugin,
            editorScriptId,
            'editorScript.js'
        );
        // The editor script sends a message here to receive settings
        await joplin.contentScripts.onMessage(editorScriptId, async (message: { name: string, data: { [key: string]: any } }) => {
            switch (message.name) {
                case 'collapsibleToggle':
                    // Checking if collapsibleList[id] exists so much here because it might be removed asynchronously
                    const { id, isFolded } = message.data;
                    if (collapsibleList[id]) collapsibleList[id].editorFolded = isFolded;
                    if (lockEditorAndWebview) {
                        if (collapsibleList[id]) collapsibleList[id].webviewFolded = isFolded;
                        if (collapsibleList[id] && ((collapsibleList[id].heading && headingsRemember) || (!collapsibleList[id].heading && blocksRemember))) collapsibleList[id].isFolded = isFolded;
                        await joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
                    }
                    if (!isMobile && (collapsibleList[id] && !collapsibleList[id].doUpdate)) updateWebview();
                    break;
                case 'getSetting':
                    return await joplin.settings.value(message.data.setting);
                    break;
                case 'getSettings':
                    const [doEditorColors, indentLevel, maxIndentLevel, collapsibleInEditor,
                            darkMode, headingsCollapsibleEditor] = await Promise.all([
                        joplin.settings.value('doEditorColors'),
                        joplin.settings.value('indentLevel'),
                        joplin.settings.value('maxIndentLevel'),
                        joplin.settings.value('collapsibleInEditor'),
                        joplin.settings.value('darkMode'),
                        joplin.settings.value('headingsCollapsibleEditor'),
                    ]);
                    const settings = { doEditorColors, startToken, endToken, indentLevel, maxIndentLevel,
                        collapsibleInEditor, lockEditorAndWebview, darkMode, blocksRemember,
                        headingsCollapsibleEditor, headingsRemember };
                    return settings;
                    break;
                case 'getList':
                    return collapsibleList;
                case 'setList':
                    const newList = message.data['collapsibleList'];
                    const merged = { ...newList };

                    for (const id in merged) {
                        if (collapsibleList[id] && 'webviewFolded' in collapsibleList[id]) {
                            merged[id].webviewFolded = collapsibleList[id].webviewFolded;
                        }
                    }

                    collapsibleList = merged;
                    joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
                    break;
                case 'toggleById':
                    collapsibleList[message.data.id].isFolded = message.data.isFolded;
                    if (lockEditorAndWebview) {
                        collapsibleList[message.data.id].webviewFolded = message.data.isFolded;
                    }
                    joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
                    break;
                default:
                    break;
            }
        });
    },
});

async function updateWebview() {
    return;
    // This function is intended to force the webview to update, without creating an associated change in the content of the editor
    // I came to the conclusion this is not currently possible, so this function currently does nothing - it is my hope I'll be able
    // to fix that in a future update
    const visible = await joplin.settings.globalValue('noteVisiblePanes');
    if (!visible || (!visible.includes('viewer'))) return;
    const note = await joplin.workspace.selectedNote();
    if (!note) return;

    const lines = note.body.split('\n');
    const lastLineIndex = lines.length - 1;
    const lastLine = lines[lastLineIndex];

    await joplin.commands.execute('editor.execCommand', {
        name: 'replaceRange',
        args: ['\uF123', { line: lastLineIndex, ch: lastLine.length }, { line: lastLineIndex, ch: lastLine.length }]
    });
}

async function updateEditor(isMobile) {
    //const visible = await joplin.settings.globalValue('noteVisiblePanes');
    //if (!visible || (!visible.includes('editor'))) return;
    if (isMobile) return;

    await joplin.commands.execute('editor.execCommand',{
        name: 'replaceRange',
        args: ['', { line: 0, ch: 0 }, { line: 0, ch: 0 }]
    });
}

// Modifies the editor whenever a block is opened or closed
async function modifyEditor(collapsible: any, noteId: string, startToken: string) {
    const note = await joplin.workspace.selectedNote();
    if (noteId !== note.id) return;

    // The relevant line from the editor
    let lines: string[] = note.body.split('\n');
    if (collapsible.lineNum < 0 || collapsible.lineNum >= lines.length) return;
    let line: string = lines[collapsible.lineNum];

    if (!('heading' in collapsible)) collapsible.heading = line.match(/^ {0,3}(#{1,6})([ \t](.*?)$|$)/);

    let newLine = line;
    if (!collapsible.heading) {
        // It should be guaranteed that the line starts with our token, possibly after whitespace
        // Calculate its actual start position - quit if for some reason it's not there
        const startPos = line.indexOf(startToken);
        if (startPos === -1) return;
        const isOpen = line.slice(startPos).startsWith(startToken + startToken);
        if (collapsible.isFolded && isOpen) {
            newLine = line.replace(startToken + startToken, startToken);
        } else if (!collapsible.isFolded && !isOpen) {
            newLine = line.replace(startToken, startToken + startToken);
        }
    } else {
    	const match = line.match(/^ {0,3}(#{1,6})([ \t](.*?)$|$)/);
    	if (!match) return; // Not a heading
    	const isOpen = !line.endsWith(' ');
        if (collapsible.isFolded && isOpen) {
            newLine = line + ' ';
        } else if (!collapsible.isFolded && !isOpen) {
            newLine = line.replace(/ +$/, '');
        }
    }
    // Only bother updating the editor if we changed something
    if (newLine !== line) {
        lines[collapsible.lineNum] = newLine;
        await joplin.data.put(['notes', note.id], null, { body : lines.join('\n') });
    }
}
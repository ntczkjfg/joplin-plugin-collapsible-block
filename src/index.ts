import joplin from 'api';
import { ContentScriptType, ToolbarButtonLocation } from 'api/types';

// Modifies the editor whenever a block is opened or closed
async function openOrCloseBlock(closedToken: string, lineNum, isOpen, noteId) {
    const note = await joplin.workspace.selectedNote();
    const openedToken = closedToken + closedToken;

    if (noteId !== note.id) return;

    // The relevant line from the editor
    const line: string = await joplin.commands.execute('editor.execCommand', { name: 'getLine', args: [lineNum] });

    // It should be guaranteed that the line starts with our token, possibly after whitespace
    // Calculate its actual start position - quit if for some reason it's not there
    const startPos = line.indexOf(closedToken);
    if (startPos === -1) return;

    let newLine = line;

    const startsWithOpenToken = line.slice(startPos, startPos + openedToken.length) === openedToken;

    if (isOpen) {
        // Make it openedToken if not already
        if (!startsWithOpenToken) {
            newLine = line.replace(closedToken, openedToken);
        }
    } else {
        // Make it closedToken if it's openedToken
        if (startsWithOpenToken) {
            newLine = line.replace(openedToken, closedToken);
        }
    }

    // Only bother updating the editor if we changed something
    if (newLine !== line) {
        await joplin.commands.execute('editor.execCommand',
        							  {
        							      name: 'replaceRange',
								   	      args: [newLine, { line: lineNum, ch: 0 }, { line: lineNum, ch: line.length }]
								   	  });
    }
}


joplin.plugins.register({
	onStart: async function() {
		// Create the settings page
		await joplin.settings.registerSection('collapsibleBlocks', {
		    label: 'Collapsible Blocks',
		    iconName: 'fas fa-angle-right',
		});
		await joplin.settings.registerSettings({
		    doEditorColors: {
		        value: true,
		        type: 3, // Boolean
		        section: 'collapsibleBlocks',
		        public: true,
		        label: 'Do Editor Colors',
		    },
		    doWebviewColors: {
		    	value: false,
		        type: 3, // Boolean
		        section: 'collapsibleBlocks',
		        public: true,
		        label: 'Do Webview Colors',
		    },
		    startToken: {
		        value: ':{', // Default start token
		        type: 2, // String
		        section: 'collapsibleBlocks',
		        public: true,
		        label: 'Start Token',
		    },
		    endToken: {
		        value: '}:', // Default end token
		        type: 2, // String
		        section: 'collapsibleBlocks',
		        public: true,
		        label: 'End Token',
		    }
		});

		// Create a toolbar button
		await joplin.commands.register({
			name: 'insertCollapsibleBlock',
			label: 'Collapsible block',
			iconName: 'fas fa-angle-right', // >
			execute: async () => {
				const selectedText = (await joplin.commands.execute('selectedText') as string);
				let content = selectedText.split('\n');
				const startToken = await joplin.settings.value('startToken');
				const endToken = await joplin.settings.value('endToken');
				if (content.length == 1 && content[0] !== '') {
					// Just a title
					await joplin.commands.execute('replaceSelection',`\n${startToken}${startToken}${content[0]}\n\n${endToken}`);
				} else if (content.length > 1) {
					// Title and body!
					await joplin.commands.execute('replaceSelection',`\n${startToken}${startToken}${content[0]}\n\t${content.slice(1).join('\n\t')}\n${endToken}`);
				} else {
					// No title or body, make our own
					await joplin.commands.execute('insertText',`\n${startToken}${startToken}Title\n\tBody\n${endToken}`);
				}
			}
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
			const startToken = await joplin.settings.value('startToken');
			switch (message.name) {
				case 'collapsibleToggle':
					const note = await joplin.workspace.selectedNote();
					const noteId = note?.id;
					if (!noteId) {
						return;
					}
					const lineNum = message.data.lineNum;
					const isOpen = message.data.isOpen;
					await openOrCloseBlock(startToken, lineNum, isOpen, noteId);
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
				case 'getSetting':
					return await joplin.settings.value(message.data.setting);
					break;
				case 'getSettings':
					const [doEditorColors, startToken, endToken] = await Promise.all([
				        joplin.settings.value('doEditorColors'),
				        joplin.settings.value('startToken'),
				        joplin.settings.value('endToken')
				    ]);
				    const settings = { doEditorColors, startToken, endToken };
				    return settings;
					break;
				default:
					break;
			}
		});
	},
});
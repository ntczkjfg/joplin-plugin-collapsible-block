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
		        value: true,
		        label: 'Color blocks in the editor',
		        description: 'Color collapsible block text in the editor. If blocks are nested, each nesting layer is a different color.',
		    },
		    doWebviewColors: {
		        section: 'collapsibleBlocks',
		    	public: true,
		        type: SettingItemType.Bool,
		    	value: false,
		        label: 'Color blocks in the webview',
		        description: `Color the border of collapsible blocks in the webview to match the editor’s text color, if editor colors are enabled. 
		        Useful when making edits to heavily nested groups of blocks.`,
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
		    	description: `If disabled, opening or closing collapsible blocks in the webview will 
		    	not change their state in the editor, which will cause them to always display as opened 
		    	or closed, depending on their state in the editor, when a note is reloaded. You can also
		    	 do this on a case-by-case basis by doubling the end token for a given block.`,
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
		    	description: `When a collapsible section is opened or closed in either the editor or webview, 
		    	the corresponding section in the other view will update automatically.`,
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
		const [
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

		let collapsibleList: any = {};
		const note = await joplin.workspace.selectedNote();
    	let noteId;
    	if (note) noteId = note.id;
    	if (noteId && headingsRemember) {
	    	const headingList: any = await joplin.data.userDataGet(ModelType.Note, noteId, 'headings');
	    	if (headingList) {
				for (const heading of Object.values(headingList) as any) {
				    collapsibleList[heading.id] = heading;
				}
			}
		}
		joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
		await joplin.workspace.onNoteSelectionChange(async (event) => {
			// Detects when the note is changed
			// editor script also does this, but doing it here too lets
			// the editor avoid an async call and sends the blank list to
			// the webview script faster
			if (event.value && event.value.length) noteId = event.value[0];
			collapsibleList = {};
			if (noteId && headingsRemember) {
				const headingList: any = await joplin.data.userDataGet(ModelType.Note, noteId, 'headings');
				if (headingList) {
					for (const heading of Object.values(headingList) as any) {
					    collapsibleList[heading.id] = heading;
					}
				}
			}
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
			let startToken;
			switch (message.name) {
				case 'collapsibleToggle':
					
					const { id, isFolded, lineNum } = message.data;
					if (id in collapsibleList) {
						if (lockEditorAndWebview || blocksRemember) {
							collapsibleList[id].isFolded = isFolded;
						}
						collapsibleList[id].webviewFolded = isFolded;
					} else {
						for (const widget of Object.values(collapsibleList)) {
							if (widget['lineNum'] === lineNum) {
								if (lockEditorAndWebview) {
									widget['isFolded'] = isFolded;
								}
								widget['webviewFolded'] = isFolded;
								break;
							}
						}
					}
					joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
					// Forces the editor to update even though nothing changed
					// Moreso, does so in a way we can detect
					if (!isMobile) {
						await joplin.commands.execute('editor.execCommand',
	        							      { name: 'replaceRange',
									   	        args: ['', { line: 0, ch: 0 }, { line: 0, ch: 0 }] });
					} else {
						const note = await joplin.workspace.selectedNote();
						if (note) await joplin.data.put(['notes', note.id], null, { body: note.body });
					}
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
					//console.error('postMessage: getSetting');
					return await joplin.settings.value(message.data.setting);
					break;
				case 'getSettings':
					//console.error('postMessage: getSettings');
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
				    	collapsibleInEditor, lockEditorAndWebview, darkMode, blocksRemember, headingsCollapsibleEditor };
				    return settings;
					break;
				case 'getList':
					//console.error('postMessage: getList');
					return collapsibleList;
				case 'setList':
					//console.error('postMessage: setList');
					collapsibleList = message.data['collapsibleList'];
					joplin.settings.setValue('collapsibleList', JSON.stringify(message.data['collapsibleList']));
					const headings: any = {};
					for (const collapsible of Object.values(collapsibleList) as any) {
					    if (collapsible.heading) {
					        headings[collapsible.lineNum] = collapsible;
					    }
					}
					joplin.data.userDataSet(ModelType.Note, noteId, 'headings', headings);
					break;
				case 'fixList':
					//console.error('postMessage: fixList');
					collapsibleList = message.data['collapsibleList'];
					if (!headingsRemember || !noteId) return collapsibleList;
					const headingList: any = await joplin.data.userDataGet(ModelType.Note, noteId, 'headings');
					if (!headingList) return collapsibleList;
					const toDelete = [];
					for (const headingKey in headingList) {
					    const lineNum = parseInt(headingKey, 10);
					    let found = false;

					    for (const collapsibleKey in collapsibleList) {
					        const collapsible = collapsibleList[collapsibleKey];
					        if (collapsible.lineNum === lineNum) {
					        	headingList[headingKey].id = collapsibleKey
					            collapsibleList[collapsibleKey] = headingList[headingKey];
					            found = true;
					            break;
					        }
					    }
					    if (!found) {
					        toDelete.push(headingKey);
					    }
					}
					for (const key in toDelete) {
						delete headingList[key];
					}
					joplin.data.userDataSet(ModelType.Note, noteId, 'headings', headingList);
					return collapsibleList;
				case 'toggleById':
					//console.error('postMessage: toggleById');
					collapsibleList[message.data.id].isFolded = message.data.isFolded;
					if (lockEditorAndWebview) {
						collapsibleList[message.data.id].webviewFolded = message.data.isFolded;
					}
					joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
					break;
				case 'collapsibleToggle':
					//console.error('postMessage: collapsibleToggle');
					const { id, isFolded } = message.data;
					//console.error(`id = ${id}, isFolded = ${isFolded}, collapsibleList[id].isFolded = ${collapsibleList[id].isFolded}`);
					if (collapsibleList[id].isFolded === isFolded) break;
					collapsibleList[id].isFolded = isFolded;
					//console.error(`id = ${id}, isFolded = ${isFolded}, collapsibleList[id].isFolded = ${collapsibleList[id].isFolded}`);
					if (lockEditorAndWebview) {
						collapsibleList[id]['webviewFolded'] = isFolded;
						await joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
					}
					updateEditor(isMobile);
					if (collapsibleList[id].heading) {
						if (!noteId) break;
						const headings2 = await joplin.data.userDataGet(ModelType.Note, noteId, 'headings');
						if (!headings2) break;
						headings2[collapsibleList[id].lineNum] = collapsibleList[id];
						joplin.data.userDataSet(ModelType.Note, noteId, 'headings', headings2);
						updateWebview();
					}
					break;
				case 'error':
					break;
					const error = message.data.error;
					console.error(error);
					break;
				default:
					break;
			}
		});
	},
});

async function updateWebview() {
	//console.error('Updating Webview');
    const visible = await joplin.settings.globalValue('noteVisiblePanes');
    if (!visible || (!visible.includes('viewer'))) return;

    const note = await joplin.workspace.selectedNote();
    if (!note) return;

    let body = note.body;
    if (body.endsWith(' ')) body = body.slice(0, -1);
    else body += ' ';

    await joplin.data.put(['notes', note.id], null, { body });
}

async function updateEditor(isMobile) {
	//console.error('Updating Editor');
    const visible = await joplin.settings.globalValue('noteVisiblePanes');
    if (!visible || (!visible.includes('editor'))) return;

    if (!isMobile) {
    	await joplin.commands.execute('editor.execCommand',
    		{ name: 'replaceRange',
    			args: ['', { line: 0, ch: 0 }, { line: 0, ch: 0 }] });
    	return;
    }

    const note = await joplin.workspace.selectedNote();
    if (!note) return;

    let body = note.body;
    if (body.endsWith(' ')) body = body.slice(0, -1);
    else body += ' ';

    await joplin.data.put(['notes', note.id], null, { body : body });
}

import joplin from 'api';
import { ContentScriptType, ToolbarButtonLocation, SettingItemType } from 'api/types';

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
		    rememberOpenOrClose: {
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
		    collapsibleHeaders: {
		    	section: 'collapsibleBlocks',
		    	public: true,
		    	type: SettingItemType.Bool,
		    	value: true,
		    	label: 'Enable header-based collapsing.',
		    },
		    collapsibleInEditor: {
		    	section: 'collapsibleBlocks',
		    	public: true,
		    	type: SettingItemType.Bool,
		    	value: true,
		    	label: 'Allow collapsing blocks within the markdown editor as well.',
		    	description: 'The below options won\'t do anything if this isn\'t checked',
		    },
		    matchEditorToWebview: {
		        section: 'collapsibleBlocks',
		    	public: true,
		    	type: SettingItemType.Bool,
		    	value: true,
		    	label: 'Match editor folding to webview folding on initial note load',
		    	description: `When enabled, block folding states in the editor will mirror the webview's 
		    	block folding states when a note is first opened. When disabled, all collapsible sections in the editor
		    	will initially be opened.`,
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
		joplin.settings.setValue('collapsibleList', '{}')
		let collapsibleList = {};
		await joplin.workspace.onNoteSelectionChange(async (event) => {
			// Detects when the note is changed
			// editor script also does this, but doing it here too lets
			// the editor avoid an async call and sends the blank list to
			// the webview script faster
			collapsibleList = {};
		    await joplin.settings.setValue('collapsibleList', '{}');
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
						if (await joplin.settings.value('lockEditorAndWebview') || await joplin.settings.value('rememberOpenOrClose')) {
							collapsibleList[id].isFolded = isFolded;
						}
						collapsibleList[id].webviewFolded = isFolded;
					} else {
						for (const widget of Object.values(collapsibleList)) {
							if (widget['lineNum'] === lineNum) {
								if (await joplin.settings.value('lockEditorAndWebview')) {
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
					await joplin.commands.execute('editor.execCommand',
        							      { name: 'replaceRange',
								   	        args: ['', { line: 0, ch: 0 }, { line: 0, ch: 0 }] });
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
					const [doEditorColors, startToken, endToken,
							indentLevel, maxIndentLevel, collapsibleInEditor,
							matchEditorToWebview, lockEditorAndWebview, darkMode, rememberOpenOrClose] = await Promise.all([
				        joplin.settings.value('doEditorColors'),
				        joplin.settings.value('startToken'),
				        joplin.settings.value('endToken'),
				        joplin.settings.value('indentLevel'),
				        joplin.settings.value('maxIndentLevel'),
				        joplin.settings.value('collapsibleInEditor'),
				        joplin.settings.value('matchEditorToWebview'),
				        joplin.settings.value('lockEditorAndWebview'),
				        joplin.settings.value('darkMode'),
				        joplin.settings.value('rememberOpenOrClose'),
				    ]);
				    const settings = { doEditorColors, startToken, endToken, indentLevel, maxIndentLevel,
				    	collapsibleInEditor, matchEditorToWebview, lockEditorAndWebview, darkMode, rememberOpenOrClose };
				    return settings;
					break;
				case 'getList':
					return collapsibleList;
				case 'setList':
					collapsibleList = message.data['collapsibleList'];
					joplin.settings.setValue('collapsibleList', JSON.stringify(message.data['collapsibleList']));
					break;
				case 'toggleById':
					collapsibleList[message.data.id].isFolded = message.data.isFolded;
					if (await joplin.settings.value('lockEditorAndWebview')) {
						collapsibleList[message.data.id].webviewFolded = message.data.isFolded;
					}
					joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
					break;
				case 'collapsibleToggle':
					const { id, isFolded } = message.data;
					collapsibleList[id].isFolded = isFolded;
					if (await joplin.settings.value('lockEditorAndWebview')) {
						collapsibleList[id]['webviewFolded'] = isFolded;
						await joplin.settings.setValue('collapsibleList', JSON.stringify(collapsibleList));
					}
					await joplin.commands.execute('editor.execCommand',
        							      { name: 'replaceRange',
								   	        args: ['', { line: 0, ch: 0 }, { line: 0, ch: 0 }] });
					break;
				default:
					break;
			}
		});
	},
});
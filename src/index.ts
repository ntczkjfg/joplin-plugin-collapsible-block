import joplin from 'api';
import { ContentScriptType, ToolbarButtonLocation } from 'api/types';
import { openOrCloseBlock } from './collapsible.js';

joplin.plugins.register({
	onStart: async function() {
		// Create a collapsible block command
		await joplin.commands.register({
			name: 'insertCollapsibleBlock',
			label: 'Collapsible block',
			iconName: 'fas fa-angle-right',
			execute: async () => {
				const selectedText = (await joplin.commands.execute('selectedText') as string);
				let content = selectedText.split('\n');
				let startToken = ':{', endToken = '}:';
				if (content.length == 1 && content[0] !== '') {
					await joplin.commands.execute('replaceSelection',`${startToken}${startToken}${content[0]}\n\n${endToken}`);
				} else if (content.length > 1) {
					await joplin.commands.execute('replaceSelection',`${startToken}${startToken}${content[0]}\n${content.slice(1).join('\n')}\n${endToken}`);
				} else {
					await joplin.commands.execute('insertText',`${startToken}${startToken}Title\nBody\n${endToken}`);
				}
			}
		});
		// Create a collapsible block toolbar button
		await joplin.views.toolbarButtons.create('insertCollapsibleBlock', 'insertCollapsibleBlock', ToolbarButtonLocation.EditorToolbar);
		
		// Create a collapsible block command shortcut
		await joplin.views.menus.create('collapsibleBlock', 'Insert collapsible block', [
			{
				commandName: 'insertCollapsibleBlock',
				accelerator: 'Ctrl+Alt+C'
			}
		]);

		// The webview plugin
		const webScriptId = 'joplin.plugin.collapsible.blocks';
		await joplin.contentScripts.register(
			ContentScriptType.MarkdownItPlugin,
			webScriptId,
			'./collapsible.js'
		);

		// The editor plugin
		const editorScriptId = 'joplin.plugin.collapsible.blocks.editor';
        // Register the CodeMirror content script
        await joplin.contentScripts.register(
            ContentScriptType.CodeMirrorPlugin,
            editorScriptId,
            './doEditorColors.js'
        );

	    // When a collapsible section is opened or closed, it sends a message here
	    // This then calls a function to modify the editor to save that change
		let pendingMessages: { isOpen: boolean, lineNum: number }[] = [];
		let debounceTimer: NodeJS.Timeout | null = null;
		await joplin.contentScripts.onMessage(webScriptId, async (message: { isOpen: boolean, lineNum: number, noteId: string }) => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
			}
			const note = await joplin.workspace.selectedNote();
			const noteId = note?.id;
			if (!noteId) {
				return;
			}
			message.noteId = noteId;
			pendingMessages.push(message);
			debounceTimer = setTimeout(async () => {
				const startToken = ':{';
				await openOrCloseBlock(joplin, startToken, pendingMessages);
				pendingMessages = [];
			}, 4000);
	    });
	},
});
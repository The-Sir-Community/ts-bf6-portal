import { SantiagoWebPlayClient, PlayElementModifier } from '../src';

/**
 * Example 1: Basic Update - Update TypeScript Code
 *
 * The standard way to update your play element using the Modifier API.
 * Errors are automatically handled by the client.
 *
 * IMPORTANT: Replace these with your own session ID and play element ID!
 * Get your session ID from the browser's DevTools (Network tab, x-gateway-session-id header)
 */
async function simpleUpdateTypeScript() {
  const client = new SantiagoWebPlayClient({
    sessionId: 'web-00000000-0000-0000-0000-000000000000',
  });

  const playElementId = '00000000-0000-0000-0000-000000000000';

  console.log('=== Example 1: Basic TypeScript Update ===\n');

  try {
    // Step 1: Fetch current play element
    const current = await client.getPlayElementDecoded({ id: playElementId });

    // Step 2: Modify using the fluent API
    const modifier = new PlayElementModifier(current)
      .setTypeScriptCode(`// Updated ${new Date().toISOString()}
console.log("Hello from TypeScript!");
console.log("This code was updated via the API");
`);

    // Step 3: Send the update (errors are automatically handled)
    const updated = await client.updatePlayElementFromModifier(playElementId, modifier);

    console.log('✓ TypeScript code updated successfully!');
    console.log('  Name:', updated.playElement?.name);
    console.log('  Publish State:', updated.playElement?.publishStateType, '(1=DRAFT, 2=PUBLISHED)');
    console.log('  Design ID:', updated.playElement?.designId);
    console.log('  Short Code:', (updated.playElement as any)?.shortCode?.value ?? '<none>');

    // Check compilation status
    const tsAttachment = updated.playElementDesign?.attachments?.find(
      (att: any) => att.attachmentType === 2
    );
    if (tsAttachment) {
      const status = tsAttachment.processingStatus;
      const compiled = (tsAttachment as any).attachmentData?.compiled?.value?.length ?? 0;
      console.log('  Compilation:', status === 2 ? '✓ Success' : `Status ${status}`);
      console.log('  Compiled size:', compiled, 'bytes');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 2: Multiple Changes - Update Several Fields at Once
 *
 * When you need to change multiple fields at once,
 * chain multiple modifiers together for maximum control.
 *
 * IMPORTANT: Replace these with your own session ID and play element ID!
 */
async function advancedModifierExample() {
  const client = new SantiagoWebPlayClient({
    sessionId: 'web-00000000-0000-0000-0000-000000000000', // Replace with your session ID!
  });

  const playElementId = '00000000-0000-0000-0000-000000000000'; // Replace with your play element ID!

  console.log('\n=== Example 2: Multiple Field Updates ===\n');

  try {
    // Step 1: Fetch current state
    const current = await client.getPlayElementDecoded({
      id: playElementId,
      includeDenied: false,
    });

    console.log('Current state:');
    console.log('  Name:', current.playElement?.name);
    console.log('  Description:', current.playElement?.description?.value ?? '<none>');

    // Step 2: Make multiple changes using fluent API
    const modifier = new PlayElementModifier(current)
      .setName('Updated Experience Name')
      .setDescription('This was updated using the Modifier API')
      .setTypeScriptCode(`// Multi-field update example
console.log("Name and description were also updated!");
`);

    // Step 3: Send the update using the convenience method
    const updated = await client.updatePlayElementFromModifier(playElementId, modifier);

    console.log('\n✓ Multiple fields updated successfully!');
    console.log('  Name:', updated.playElement?.name);
    console.log('  Description:', updated.playElement?.description?.value);
    console.log('  Design ID:', updated.playElement?.designId);

  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 3: Automatic Error Recovery
 *
 * The client automatically handles error recovery on ALL updates:
 * - Clears errors from attachments being updated
 * - Resets ERROR publish state to DRAFT
 * - Allows you to continue updating without manual intervention
 *
 * IMPORTANT: Replace these with your own session ID and play element ID!
 */
async function errorRecoveryExample() {
  const client = new SantiagoWebPlayClient({
    sessionId: 'web-00000000-0000-0000-0000-000000000000', // Replace with your session ID!
  });

  const playElementId = '00000000-0000-0000-0000-000000000000'; // Replace with your play element ID!

  console.log('\n=== Example 3: Automatic Error Recovery ===\n');

  try {
    // Check current state
    const current = await client.getPlayElementDecoded({
      id: playElementId,
      includeDenied: false,
    });

    console.log('Current state:');
    console.log('  Publish State:', current.playElement?.publishStateType);
    console.log('  Total attachments:', current.playElementDesign?.attachments?.length);

    const errored = current.playElementDesign?.attachments?.filter(
      (att: any) => att.errors && att.errors.length > 0
    );
    console.log('  Attachments with errors:', errored?.length ?? 0);

    // Even if there are errors, the update will work
    // The client automatically clears errors and resets state
    const modifier = new PlayElementModifier(current)
      .setTypeScriptCode(`// Recovery example
console.log("Successfully recovered from ERROR state!");
`);

    const updated = await client.updatePlayElementFromModifier(playElementId, modifier);

    console.log('\n✓ Updated successfully despite previous errors!');
    console.log('  New Publish State:', updated.playElement?.publishStateType, '(should be 1=DRAFT if was in ERROR)');
    console.log('  Clean attachments:', updated.playElementDesign?.attachments?.length);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run examples
async function main() {
  console.log('Santiago WebPlay Client - API Examples');
  console.log('=====================================\n');

  // Run the simple example
  await simpleUpdateTypeScript();

  // Uncomment to run other examples:
  // await advancedModifierExample();
  // await errorRecoveryExample();

  console.log('\n✓ Done!\n');
}

main();

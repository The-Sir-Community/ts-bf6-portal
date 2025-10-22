import {
  SantiagoWebPlayClient,
  PlayElementModifier,
  MapRotationBuilder,
  RotationBehavior,
  createTeams,
  BalancingMethod,
} from '../src';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Example: Update map rotation with spatial JSON files
 *
 * This example demonstrates how to:
 * 1. Load spatial JSON files from disk
 * 2. Configure a map rotation using the type-safe MapRotationBuilder
 * 3. Include spatial data directly in map configuration
 * 4. Update the play element (spatial attachments are created automatically!)
 *
 * The spatial data is now part of the MapEntry configuration, making the API
 * cleaner and ensuring that maps and their spatial data are kept together.
 */
async function updateMapRotation() {
  const client = new SantiagoWebPlayClient({
    sessionId: 'web-00000000-0000-0000-0000-000000000000',
  });

  const playElementId = '00000000-0000-0000-0000-000000000000';

  console.log('=== Update Map Rotation Example ===\n');

  try {
    // Step 1: Fetch the current play element
    console.log('Fetching current play element...');
    const current = await client.getPlayElementDecoded({
      id: playElementId,
      includeDenied: true,
    });

    console.log('  Current name:', current.playElement?.name);
    console.log('  Current maps:', current.playElementDesign?.mapRotation?.maps?.length ?? 0);

    // Step 2: Load spatial JSON files from disk
    console.log('\nLoading spatial JSON files...');
    const spatialDir = path.resolve(__dirname, '../raw_data/test_levels');

    const batterySpatial = fs.readFileSync(
      path.join(spatialDir, 'MP_Battery_BR6.spatial.json'),
      'utf8'
    );

    const dumboSpatial = fs.readFileSync(
      path.join(spatialDir, 'MP_Dumbo_BR6.spatial.json'),
      'utf8'
    );

    console.log('  Loaded MP_Battery_BR6.spatial.json:', batterySpatial.length, 'bytes');
    console.log('  Loaded MP_Dumbo_BR6.spatial.json:', dumboSpatial.length, 'bytes');

    // Step 3: Configure the map rotation WITH spatial data
    console.log('\nConfiguring map rotation with spatial data...');
    const modifier = new PlayElementModifier(current);

    // Clear existing spatial attachments to start fresh
    modifier.clearSpatialAttachments();

    // Option 1: Using the builder pattern (recommended)
    // Spatial data is now part of the map configuration!
    const rotation = new MapRotationBuilder()
      .addMap('MP_Battery', {  // Iberian Offensive
        rounds: 1,
        allowedSpectators: 4,
        teamComposition: createTeams([32, 32], BalancingMethod.SKILL),
        spatialData: batterySpatial,
        spatialFilename: 'MP_Battery_BR6.spatial.json'
      })
      .addMap('MP_Dumbo', {    // Manhattan Bridge
        rounds: 1,
        allowedSpectators: 4,
        teamComposition: createTeams([32, 32], BalancingMethod.SKILL),
        spatialData: dumboSpatial,
        spatialFilename: 'MP_Dumbo_BR6.spatial.json'
      })
      .addMap('MP_Battery', {  // Iberian Offensive again
        rounds: 2,  // Different rounds to distinguish
        allowedSpectators: 4,
        teamComposition: createTeams([32, 32], BalancingMethod.SKILL),
        spatialData: batterySpatial,
        spatialFilename: 'MP_Battery_BR6_round2.spatial.json'
      })
      .setRotationBehavior(RotationBehavior.LOOP)
      .build();

    // setMapRotation now automatically creates spatial attachments!
    modifier.setMapRotation(rotation.maps, rotation.rotationBehavior);

    // Option 2: Direct array (simpler for basic rotations)
    // modifier.setMapRotation([
    //   {
    //     levelName: 'MP_Battery',
    //     rounds: 1,
    //     spatialData: batterySpatial,
    //     spatialFilename: 'MP_Battery_BR6.spatial.json'
    //   },
    //   {
    //     levelName: 'MP_Dumbo',
    //     rounds: 1,
    //     spatialData: dumboSpatial
    //   }
    // ], RotationBehavior.LOOP);

    console.log('  Map rotation configured with 3 maps');
    console.log('  Spatial attachments automatically created:');
    console.log('    - mapIdx=0: MP_Battery_BR6.spatial.json');
    console.log('    - mapIdx=1: MP_Dumbo_BR6.spatial.json');
    console.log('    - mapIdx=2: MP_Battery_BR6_round2.spatial.json');

    // Step 4: Send the update
    console.log('\nSending update to server...');
    const { playElement, playElementDesign } = modifier.build();

    const updated = await client.updatePlayElement({
      id: playElementId,
      playElement,
      playElementDesign,
    });

    console.log('\n✓ Map rotation updated successfully!');
    console.log('  Total maps:', updated.playElementDesign?.mapRotation?.maps?.length);
    console.log('  Total attachments:', updated.playElementDesign?.attachments?.length);

    // Display the mapping
    console.log('\n  Map → Spatial Attachment Mapping:');
    updated.playElementDesign?.mapRotation?.maps?.forEach((map: any, idx: number) => {
      const matchingAtt = updated.playElementDesign?.attachments?.find((att: any) =>
        att.metadata?.value === `mapIdx=${idx}`
      );
      const filename = typeof matchingAtt?.filename === 'string'
        ? matchingAtt.filename
        : matchingAtt?.filename?.value ?? '<none>';
      console.log(`    [${idx}] ${map.levelName} (${map.rounds} round${map.rounds > 1 ? 's' : ''}) → ${filename}`);
    });

    console.log('\nView in web portal:');
    console.log('  URL:', `https://portal.battlefield.com/bf6/experience/rules?playgroundId=${playElementId}`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

updateMapRotation();

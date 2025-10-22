import {
  MapRotationBuilder,
  RotationBehavior,
  BalancingMethod,
  createTeams,
  type MapEntry,
} from '../src';

/**
 * Demo: Type-safe Map Rotation Builder API
 *
 * This example demonstrates the various ways to build map rotations
 * using the new type-safe API with IntelliSense support.
 */
function mapRotationBuilderDemo() {
  console.log('=== Map Rotation Builder Demo ===\n');

  // ========================================================================
  // Example 1: Builder Pattern (Recommended for complex rotations)
  // ========================================================================
  console.log('Example 1: Builder Pattern with 32v32 Skill Balancing');
  console.log('-------------------------------------------------------');

  const rotation1 = new MapRotationBuilder()
    .addMap('MP_Battery', {
      rounds: 2,
      allowedSpectators: 8,
      teamComposition: createTeams([32, 32], BalancingMethod.SKILL),
    })
    .addMap('MP_Dumbo', {
      rounds: 1,
      allowedSpectators: 4,
      teamComposition: createTeams([32, 32], BalancingMethod.SKILL),
    })
    .setRotationBehavior(RotationBehavior.LOOP)
    .build();

  console.log('  Maps:', rotation1.maps.length);
  console.log('  Rotation Behavior:', RotationBehavior[rotation1.rotationBehavior ?? 0]);
  console.log('  Map 0:', rotation1.maps[0].levelName, '-', rotation1.maps[0].rounds, 'round(s)');
  console.log('  Map 1:', rotation1.maps[1].levelName, '-', rotation1.maps[1].rounds, 'round(s)');

  // ========================================================================
  // Example 2: Direct Array Syntax (Simple and concise)
  // ========================================================================
  console.log('\nExample 2: Direct Array Syntax (Minimal Configuration)');
  console.log('--------------------------------------------------------');

  const rotation2: MapEntry[] = [
    { levelName: 'MP_Battery', rounds: 1 },
    { levelName: 'MP_Dumbo', rounds: 2 },
  ];

  console.log('  Maps:', rotation2.length);
  rotation2.forEach((map, idx) => {
    console.log(`  Map ${idx}:`, map.levelName, '-', map.rounds, 'round(s)');
  });

  // ========================================================================
  // Example 3: Custom Team Composition (3-way battles)
  // ========================================================================
  console.log('\nExample 3: Custom 16v16v16 Team Composition');
  console.log('--------------------------------------------');

  const rotation3 = new MapRotationBuilder()
    .addMap('MP_Custom', {
      rounds: 1,
      teamComposition: createTeams([16, 16, 16], BalancingMethod.SQUAD),
    })
    .setRotationBehavior(RotationBehavior.ONE_MAP)
    .build();

  const teams = rotation3.maps[0].teamComposition?.teams ?? [];
  console.log('  Teams:', teams.length);
  teams.forEach((team, idx) => {
    console.log(`    Team ${team.teamId}: ${team.capacity} players`);
  });
  console.log('  Balancing:', BalancingMethod[rotation3.maps[0].teamComposition?.balancingMethod ?? 0]);

  // ========================================================================
  // Example 4: End of Round Map Voting (EORMM)
  // ========================================================================
  console.log('\nExample 4: End of Round Map Voting');
  console.log('------------------------------------');

  const rotation4 = new MapRotationBuilder()
    .addMap('MP_Battery')
    .addMap('MP_Dumbo')
    .addMap('MP_Narvik')
    .setRotationBehavior(RotationBehavior.EORMM)
    .build();

  console.log('  Maps:', rotation4.maps.length);
  console.log('  Rotation Behavior:', RotationBehavior[rotation4.rotationBehavior ?? 0]);

  // ========================================================================
  // Example 5: Mixed Team Sizes
  // ========================================================================
  console.log('\nExample 5: Mixed Team Sizes (16v16 and 32v32)');
  console.log('-----------------------------------------------');

  const rotation5 = new MapRotationBuilder()
    .addMap('MP_Small_Map', {
      teamComposition: createTeams([16, 16], BalancingMethod.SKILL),
    })
    .addMap('MP_Large_Map', {
      teamComposition: createTeams([32, 32], BalancingMethod.SKILL),
    })
    .build();

  console.log('  Map 0 capacity:', rotation5.maps[0].teamComposition?.teams.reduce((sum, t) => sum + t.capacity, 0), 'players');
  console.log('  Map 1 capacity:', rotation5.maps[1].teamComposition?.teams.reduce((sum, t) => sum + t.capacity, 0), 'players');

  // ========================================================================
  // Type Safety Examples
  // ========================================================================
  console.log('\n=== Type Safety Benefits ===');
  console.log('The following would cause TypeScript compilation errors:');
  console.log('  ✘ Missing required field: { rounds: 1 } // missing levelName');
  console.log('  ✘ Invalid enum: RotationBehavior.INVALID');
  console.log('  ✘ Wrong type: { levelName: 123 } // should be string');
  console.log('  ✓ IntelliSense provides autocomplete for all fields');
  console.log('  ✓ Compiler catches typos and missing fields at build time');
}

// Run the demo
mapRotationBuilderDemo();

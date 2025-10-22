/**
 * Comprehensive tests for experience-loader.ts
 * Tests configuration loading, validation, and transformation
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  loadExperienceFromConfig,
  downloadExperienceAsJSON,
  validateExperienceConfig,
  ASSET_CATEGORY_UUID_MAP,
  ASSET_CATEGORY_NAME_TO_UUID,
  type ExperienceConfig,
  type MapConfig,
  type GlobalRuleConfig,
  type SparseRuleConfig,
  type AssetRestriction,
  type LoadExperienceOptions,
} from '../../src/webplay/experience-loader';
import { SantiagoWebPlayClient, PlayElementModifier } from '../../src/webplay/playweb-client';

// Mock modules
jest.mock('fs');
jest.mock('../../src/webplay/playweb-client');

describe('Experience Loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BF_PORTAL_SESSION_ID = undefined;
  });

  // ============================================================================
  // Configuration Validation Tests
  // ============================================================================

  describe('validateExperienceConfig', () => {
    it('should validate a complete valid config', () => {
      const configPath = '/test/config.json';
      const config: ExperienceConfig = {
        name: 'Test Experience',
        maps: [
          {
            map: 'Kaleidoscope',
            teams: [32, 32],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required name field', () => {
      const configPath = '/test/config.json';
      const config: any = {
        maps: [{ map: 'Kaleidoscope' }],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should detect missing maps', () => {
      const configPath = '/test/config.json';
      const config: any = {
        name: 'Test',
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(false);
      // Either "At least one map is required" or an error about undefined maps
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toBeDefined();
    });

    it('should detect missing map names', () => {
      const configPath = '/test/config.json';
      const config: any = {
        name: 'Test',
        maps: [{}],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Map 1: Missing map name');
    });

    it('should warn when experience ID is missing', () => {
      const configPath = '/test/config.json';
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig(configPath);

      expect(result.warnings).toContain('No experience ID in config (must be provided as option)');
    });

    it('should detect missing script file', () => {
      const configPath = '/test/config.json';
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        script: { file: 'missing-script.ts' },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Script file not found: missing-script.ts');
    });

    it('should detect missing spatial files', () => {
      const configPath = '/test/config.json';
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            spatial: { file: 'missing-spatial.json' },
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Map 1: Spatial file not found: missing-spatial.json');
    });

    it('should handle invalid JSON', () => {
      const configPath = '/test/config.json';

      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json {]');

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle file read errors', () => {
      const configPath = '/test/config.json';

      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT: File not found');
      });

      const result = validateExperienceConfig(configPath);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('ENOENT: File not found');
    });
  });

  // ============================================================================
  // Map Configuration Tests
  // ============================================================================

  describe('Map Configuration Loading', () => {
    it('should load map with basic configuration', () => {
      const mapConfig: MapConfig = {
        map: 'Kaleidoscope',
        teams: [32, 32],
        rounds: 1,
        spectators: 4,
      };

      const config: ExperienceConfig = {
        name: 'Test',
        maps: [mapConfig],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support deprecated levelName field', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            levelName: 'Breakaway', // Deprecated field
            teams: [32, 32],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support deprecated teamSize field', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            teamSize: '32v32', // Deprecated field
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate custom team configurations', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            teams: [16, 16, 8], // 3 teams
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Game Rules / Mutators Tests
  // ============================================================================

  describe('Game Rules Configuration', () => {
    it('should load global rules', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        globalRules: [
          {
            name: 'SOLDIER_HEALTH_MULTIPLIER',
            value: 1.5,
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should load map-level rules', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            rules: [
              {
                name: 'SOLDIER_HEALTH_MULTIPLIER',
                value: 1.5,
              },
            ],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should load sparse/per-team rules', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            rules: [
              {
                name: 'SOLDIER_MAX_HEALTH_PER_TEAM',
                perTeamValues: [150, 100],
                defaultValue: 120,
              } as SparseRuleConfig,
            ],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support different rule value types', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            rules: [
              { name: 'BOOLEAN_RULE', value: true } as GlobalRuleConfig,
              { name: 'INT_RULE', value: 42 } as GlobalRuleConfig,
              { name: 'FLOAT_RULE', value: 3.14 } as GlobalRuleConfig,
              { name: 'STRING_RULE', value: 'test' } as GlobalRuleConfig,
            ],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Asset Restriction Tests
  // ============================================================================

  describe('Asset Restrictions', () => {
    it('should load asset restrictions', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        restrictions: [
          {
            tagId: 'weapon',
            allowAll: false,
            allowedTags: ['rifle_assault_m16a2'],
          } as AssetRestriction,
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support UUID format for asset categories', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        restrictions: [
          {
            tagId: '47ef914c-ad5b-4248-ae86-d73d1369c009', // class_assault UUID
            allowAll: true,
          } as AssetRestriction,
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support per-team asset restrictions', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        restrictions: [
          {
            tagId: 'vehicle',
            allowAll: false,
            perTeamRestrictions: [
              { teamId: 1, allowAll: true },
              { teamId: 2, allowAll: false, allowedTags: ['heli_transport'] },
            ],
          } as AssetRestriction,
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Script Loading Tests
  // ============================================================================

  describe('Script Configuration', () => {
    it('should validate inline scripts', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        script: {
          inline: 'console.log("test");',
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate code field as script alias', () => {
      const config: any = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        script: {
          code: 'console.log("test");', // Alias for inline
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate script from file', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        script: {
          file: 'script.ts',
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Localization Strings Tests
  // ============================================================================

  describe('Localization Strings', () => {
    it('should validate strings data object', () => {
      const config: any = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        strings: {
          data: {
            'en-US': {
              menu_title: 'Game Title',
            },
          },
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate strings from file', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        strings: {
          file: 'strings.json',
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Bot Configuration Tests
  // ============================================================================

  describe('Bot Configuration', () => {
    it('should load bot spawn configuration', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            bots: [
              {
                team: 1,
                count: 10,
                type: 'fill',
              },
            ],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support deprecated bot field names', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            bots: [
              {
                teamId: 1, // Deprecated
                count: 10,
                spawnType: 'FILL', // Deprecated
              },
            ],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Rotation Behavior Tests
  // ============================================================================

  describe('Rotation Behavior', () => {
    it('should validate loop rotation', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        rotation: 'loop',
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate shuffle rotation', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        rotation: 'shuffle',
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate once rotation', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        rotation: 'once',
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Complex Multi-Feature Configurations
  // ============================================================================

  describe('Complex Configurations', () => {
    it('should load a complete multi-map experience', () => {
      const config: ExperienceConfig = {
        name: 'Full Featured Experience',
        description: 'A complete test experience',
        rotation: 'loop',
        published: true,
        id: '12345-67890',
        maps: [
          {
            map: 'Kaleidoscope',
            rounds: 2,
            teams: [32, 32],
            balancing: 'skill',
            spectators: 8,
            joinability: {
              joinInProgress: true,
              openJoin: true,
              invites: true,
            },
            matchmaking: true,
            rules: [
              {
                name: 'SOLDIER_HEALTH_MULTIPLIER',
                value: 1.5,
              } as GlobalRuleConfig,
            ],
            bots: [
              {
                team: 1,
                count: 5,
                type: 'fill',
              },
            ],
          },
          {
            map: 'Breakaway',
            rounds: 1,
            teams: [16, 16],
            balancing: 'squad',
          },
        ],
        globalRules: [
          {
            name: 'GAME_SPEED_MULTIPLIER',
            value: 1.0,
          } as GlobalRuleConfig,
        ],
        restrictions: [
          {
            tagId: 'weapon',
            allowAll: false,
            allowedTags: ['rifle_assault_m16a2'],
          } as AssetRestriction,
        ],
        script: {
          inline: 'console.log("Experience loaded");',
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle multiple maps with different configurations', () => {
      const config: ExperienceConfig = {
        name: 'Multi-Map Experience',
        maps: [
          {
            map: 'Kaleidoscope',
            teams: [32, 32],
            rules: [{ name: 'RULE_1', value: 1 } as GlobalRuleConfig],
          },
          {
            map: 'Breakaway',
            teams: [16, 16],
            rules: [{ name: 'RULE_2', value: 2 } as GlobalRuleConfig],
          },
          {
            map: 'Renewal',
            teams: [64, 64],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Joinability Settings Tests
  // ============================================================================

  describe('Joinability Settings', () => {
    it('should load joinability settings', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            joinability: {
              joinInProgress: true,
              openJoin: false,
              invites: true,
            },
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support deprecated joinability field names', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            gameSettings: {
              openToJoinByPlayer: true,
              openToInvites: false,
            },
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Asset Category UUID Mapping Tests
  // ============================================================================

  describe('Asset Category Mappings', () => {
    it('should have known UUID mappings', () => {
      expect(ASSET_CATEGORY_UUID_MAP).toHaveProperty('47ef914c-ad5b-4248-ae86-d73d1369c009');
      expect(ASSET_CATEGORY_UUID_MAP['47ef914c-ad5b-4248-ae86-d73d1369c009']).toBe('class_assault');
    });

    it('should populate reverse name-to-UUID mapping', () => {
      const nameKey = Object.keys(ASSET_CATEGORY_NAME_TO_UUID)[0];
      expect(nameKey).toBeDefined();
      expect(ASSET_CATEGORY_NAME_TO_UUID[nameKey]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  // ============================================================================
  // Publish State Tests
  // ============================================================================

  describe('Publish State', () => {
    it('should load published experience', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        published: true,
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should load draft experience', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        published: false,
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support deprecated publishState field', () => {
      const config: any = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        publishState: 'PUBLISHED', // Deprecated field
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Team Balancing Tests
  // ============================================================================

  describe('Team Balancing', () => {
    it('should load skill-based balancing', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            balancing: 'skill',
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should load squad-based balancing', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            balancing: 'squad',
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should load no balancing', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            balancing: 'none',
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support deprecated teamBalancing field', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            teamBalancing: 'SKILL', // Deprecated field
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases and Special Scenarios
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle very large team sizes', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            teams: [256, 256],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should handle asymmetric team sizes', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            teams: [32, 48, 16],
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should handle many maps in rotation', () => {
      const maps: MapConfig[] = Array.from({ length: 20 }, (_, i) => ({
        map: `Map${i + 1}`,
      }));

      const config: ExperienceConfig = {
        name: 'Test',
        maps,
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should handle many rules per map', () => {
      const rules: GlobalRuleConfig[] = Array.from({ length: 50 }, (_, i) => ({
        name: `RULE_${i}`,
        value: i,
      }));

      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            rules,
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should handle many asset restrictions', () => {
      const restrictions: AssetRestriction[] = Array.from({ length: 20 }, (_, i) => ({
        tagId: `restriction_${i}`,
        allowAll: i % 2 === 0,
      }));

      const config: ExperienceConfig = {
        name: 'Test',
        maps: [{ map: 'Kaleidoscope' }],
        restrictions,
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should handle empty map array (would fail validation)', () => {
      const config: any = {
        name: 'Test',
        maps: [],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one map is required');
    });

    it('should handle very long experience name', () => {
      const config: ExperienceConfig = {
        name: 'A'.repeat(500),
        maps: [{ map: 'Kaleidoscope' }],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should handle special characters in names', () => {
      const config: ExperienceConfig = {
        name: 'Test Experience™ with 特殊文字 🎮',
        maps: [{ map: 'Kaleidoscope' }],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });

  // ============================================================================
  // Spatial Data Tests
  // ============================================================================

  describe('Spatial Data Configuration', () => {
    it('should validate spatial data from file', () => {
      const config: ExperienceConfig = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            spatial: {
              file: 'spatial.json',
            },
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate inline spatial data', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            spatial: {
              inline: { mapWidth: 1000, mapHeight: 1000 },
            },
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should validate spatial data object', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            spatial: {
              data: { mapWidth: 1000, mapHeight: 1000 },
            },
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });

    it('should support deprecated spatialData field', () => {
      const config: any = {
        name: 'Test',
        maps: [
          {
            map: 'Kaleidoscope',
            spatialData: {
              file: 'spatial.json',
            },
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(config));
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = validateExperienceConfig('/test/config.json');

      expect(result.isValid).toBe(true);
    });
  });
});

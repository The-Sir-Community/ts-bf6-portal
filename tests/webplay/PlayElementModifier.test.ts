/**
 * Tests for PlayElementModifier class
 */

import { PlayElementModifier } from '../../src/webplay/playweb-client';
import {
  mockPlayElementResponse,
  mockPlayElement,
  mockPlayElementDesign,
  deepClone,
} from './fixtures';
import type { PlayElementResponse } from '../../src/webplay/playweb-client';

describe('PlayElementModifier', () => {
  let testResponse: PlayElementResponse;

  beforeEach(() => {
    // Create a fresh copy for each test to avoid test pollution
    testResponse = deepClone(mockPlayElementResponse);
  });

  describe('constructor', () => {
    it('should create an instance with a deep clone of the response', () => {
      const modifier = new PlayElementModifier(testResponse);
      expect(modifier).toBeInstanceOf(PlayElementModifier);

      // Verify deep clone by checking that modifications don't affect original
      const built = modifier.setName('Modified Name').build();
      expect(built.playElement.name).toBe('Modified Name');
      expect(testResponse.playElement?.name).toBe('Test Play Element');
    });

    it('should handle empty response objects', () => {
      const emptyResponse: PlayElementResponse = {};
      const modifier = new PlayElementModifier(emptyResponse);
      expect(modifier).toBeInstanceOf(PlayElementModifier);
    });
  });

  describe('setName', () => {
    it('should set the name of the play element', () => {
      const modifier = new PlayElementModifier(testResponse);
      modifier.setName('New Element Name');

      const result = modifier.build();
      expect(result.playElement.name).toBe('New Element Name');
    });

    it('should create playElement if it does not exist', () => {
      const emptyResponse: PlayElementResponse = { playElementDesign: mockPlayElementDesign };
      const modifier = new PlayElementModifier(emptyResponse);
      modifier.setName('Created Name');

      const result = modifier.build();
      expect(result.playElement.name).toBe('Created Name');
    });

    it('should return this for chaining', () => {
      const modifier = new PlayElementModifier(testResponse);
      const result = modifier.setName('Test');
      expect(result).toBe(modifier);
    });
  });

  describe('setDescription', () => {
    it('should set the description with proper StringValue format', () => {
      const modifier = new PlayElementModifier(testResponse);
      modifier.setDescription('New description text');

      const result = modifier.build();
      expect(result.playElement.description).toEqual({ value: 'New description text' });
    });

    it('should create playElement if it does not exist', () => {
      const emptyResponse: PlayElementResponse = { playElementDesign: mockPlayElementDesign };
      const modifier = new PlayElementModifier(emptyResponse);
      modifier.setDescription('Created description');

      const result = modifier.build();
      expect(result.playElement.description).toEqual({ value: 'Created description' });
    });

    it('should return this for chaining', () => {
      const modifier = new PlayElementModifier(testResponse);
      const result = modifier.setDescription('Test');
      expect(result).toBe(modifier);
    });
  });

  describe('setScript', () => {
    it('should update the script attachment with new content', () => {
      const modifier = new PlayElementModifier(testResponse);
      const newScript = '// New script\nconsole.log("Updated!");';
      modifier.setScript(newScript);

      const result = modifier.build();
      const scriptAttachment = result.playElementDesign.attachments?.find(
        att => att.attachmentType === 'ATTACHMENT_TYPE_SPATIAL' || att.attachmentType === 1
      );

      expect(scriptAttachment).toBeDefined();
      expect(scriptAttachment?.attachmentData?.original).toBeDefined();

      // Convert Buffer to string to verify content
      const scriptBuffer = scriptAttachment?.attachmentData?.original as Buffer;
      const scriptContent = scriptBuffer.toString('utf-8');
      expect(scriptContent).toBe(newScript);
    });

    it('should throw error if playElementDesign is missing', () => {
      const responseWithoutDesign: PlayElementResponse = {
        playElement: mockPlayElement,
      };
      const modifier = new PlayElementModifier(responseWithoutDesign);

      expect(() => {
        modifier.setScript('console.log("test");');
      }).toThrow('PlayElementDesign is missing from response');
    });

    it('should throw error if script attachment is not found', () => {
      const responseWithoutScript: PlayElementResponse = {
        playElement: mockPlayElement,
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_OTHER',
              attachmentData: {},
            },
          ],
        },
      };
      const modifier = new PlayElementModifier(responseWithoutScript);

      expect(() => {
        modifier.setScript('console.log("test");');
      }).toThrow('Spatial attachment not found on the play element');
    });

    it('should create attachmentData if it does not exist', () => {
      const responseWithEmptyAttachment: PlayElementResponse = {
        playElement: mockPlayElement,
        playElementDesign: {
          attachments: [
            {
              attachmentType: 'ATTACHMENT_TYPE_SPATIAL',
              // attachmentData is missing
            },
          ],
        },
      };
      const modifier = new PlayElementModifier(responseWithEmptyAttachment);
      modifier.setScript('console.log("test");');

      const result = modifier.build();
      const scriptAttachment = result.playElementDesign.attachments?.[0];
      expect(scriptAttachment?.attachmentData).toBeDefined();
      expect(scriptAttachment?.attachmentData?.original).toBeDefined();
    });

    it('should handle numeric attachment type (1)', () => {
      const responseWithNumericType: PlayElementResponse = {
        playElement: mockPlayElement,
        playElementDesign: {
          attachments: [
            {
              attachmentType: 1, // numeric type instead of string
              attachmentData: {},
            },
          ],
        },
      };
      const modifier = new PlayElementModifier(responseWithNumericType);
      const newScript = 'console.log("numeric type");';
      modifier.setScript(newScript);

      const result = modifier.build();
      const scriptBuffer = result.playElementDesign.attachments?.[0].attachmentData?.original as Buffer;
      expect(scriptBuffer.toString('utf-8')).toBe(newScript);
    });

    it('should return this for chaining', () => {
      const modifier = new PlayElementModifier(testResponse);
      const result = modifier.setScript('test');
      expect(result).toBe(modifier);
    });
  });

  describe('setThumbnailUrl', () => {
    it('should set the thumbnail URL with proper StringValue format', () => {
      const modifier = new PlayElementModifier(testResponse);
      const url = 'https://example.com/new-thumbnail.jpg';
      modifier.setThumbnailUrl(url);

      const result = modifier.build();
      expect(result.playElement.thumbnailUrl).toEqual({ value: url });
    });

    it('should create playElement if it does not exist', () => {
      const emptyResponse: PlayElementResponse = { playElementDesign: mockPlayElementDesign };
      const modifier = new PlayElementModifier(emptyResponse);
      const url = 'https://example.com/thumbnail.jpg';
      modifier.setThumbnailUrl(url);

      const result = modifier.build();
      expect(result.playElement.thumbnailUrl).toEqual({ value: url });
    });

    it('should return this for chaining', () => {
      const modifier = new PlayElementModifier(testResponse);
      const result = modifier.setThumbnailUrl('test.jpg');
      expect(result).toBe(modifier);
    });
  });

  describe('setPublishState', () => {
    it('should set the publish state', () => {
      const modifier = new PlayElementModifier(testResponse);
      modifier.setPublishState(2);

      const result = modifier.build();
      expect(result.playElement.publishStateType).toBe(2);
    });

    it('should create playElement if it does not exist', () => {
      const emptyResponse: PlayElementResponse = { playElementDesign: mockPlayElementDesign };
      const modifier = new PlayElementModifier(emptyResponse);
      modifier.setPublishState(3);

      const result = modifier.build();
      expect(result.playElement.publishStateType).toBe(3);
    });

    it('should return this for chaining', () => {
      const modifier = new PlayElementModifier(testResponse);
      const result = modifier.setPublishState(1);
      expect(result).toBe(modifier);
    });
  });

  describe('getResponse', () => {
    it('should return the current response object', () => {
      const modifier = new PlayElementModifier(testResponse);
      const response = modifier.getResponse();

      expect(response).toBeDefined();
      expect(response.playElement).toBeDefined();
      expect(response.playElementDesign).toBeDefined();
    });

    it('should return the modified response', () => {
      const modifier = new PlayElementModifier(testResponse);
      modifier.setName('Modified Name');

      const response = modifier.getResponse();
      expect(response.playElement?.name).toBe('Modified Name');
    });
  });

  describe('build', () => {
    it('should return playElement and playElementDesign', () => {
      const modifier = new PlayElementModifier(testResponse);
      const result = modifier.build();

      expect(result).toHaveProperty('playElement');
      expect(result).toHaveProperty('playElementDesign');
      expect(result.playElement).toBeDefined();
      expect(result.playElementDesign).toBeDefined();
    });

    it('should throw error if playElement is missing', () => {
      const responseWithoutElement: PlayElementResponse = {
        playElementDesign: mockPlayElementDesign,
      };
      const modifier = new PlayElementModifier(responseWithoutElement);

      expect(() => {
        modifier.build();
      }).toThrow('Response is missing required playElement or playElementDesign');
    });

    it('should throw error if playElementDesign is missing', () => {
      const responseWithoutDesign: PlayElementResponse = {
        playElement: mockPlayElement,
      };
      const modifier = new PlayElementModifier(responseWithoutDesign);

      expect(() => {
        modifier.build();
      }).toThrow('Response is missing required playElement or playElementDesign');
    });
  });

  describe('method chaining', () => {
    it('should support chaining multiple operations', () => {
      const modifier = new PlayElementModifier(testResponse);
      const result = modifier
        .setName('Chained Name')
        .setDescription('Chained Description')
        .setThumbnailUrl('https://example.com/chained.jpg')
        .setPublishState(2)
        .build();

      expect(result.playElement.name).toBe('Chained Name');
      expect(result.playElement.description).toEqual({ value: 'Chained Description' });
      expect(result.playElement.thumbnailUrl).toEqual({ value: 'https://example.com/chained.jpg' });
      expect(result.playElement.publishStateType).toBe(2);
    });

    it('should support chaining with script updates', () => {
      const modifier = new PlayElementModifier(testResponse);
      const newScript = 'console.log("chained");';

      const result = modifier
        .setName('Script Update')
        .setScript(newScript)
        .setDescription('With script')
        .build();

      expect(result.playElement.name).toBe('Script Update');
      expect(result.playElement.description).toEqual({ value: 'With script' });

      const scriptAttachment = result.playElementDesign.attachments?.find(
        att => att.attachmentType === 'ATTACHMENT_TYPE_SPATIAL'
      );
      const scriptBuffer = scriptAttachment?.attachmentData?.original as Buffer;
      expect(scriptBuffer.toString('utf-8')).toBe(newScript);
    });
  });

  describe('immutability', () => {
    it('should not modify the original response object', () => {
      const originalName = testResponse.playElement?.name;
      const originalDescription = testResponse.playElement?.description?.value;

      const modifier = new PlayElementModifier(testResponse);
      modifier
        .setName('Modified Name')
        .setDescription('Modified Description')
        .build();

      expect(testResponse.playElement?.name).toBe(originalName);
      expect(testResponse.playElement?.description?.value).toBe(originalDescription);
    });

    it('should allow multiple modifiers from the same source', () => {
      const modifier1 = new PlayElementModifier(testResponse);
      const modifier2 = new PlayElementModifier(testResponse);

      modifier1.setName('Modifier 1');
      modifier2.setName('Modifier 2');

      const result1 = modifier1.build();
      const result2 = modifier2.build();

      expect(result1.playElement.name).toBe('Modifier 1');
      expect(result2.playElement.name).toBe('Modifier 2');
      expect(testResponse.playElement?.name).toBe('Test Play Element');
    });
  });
});

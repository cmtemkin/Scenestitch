import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SceneStitch API',
      version: '1.0.0',
      description: 'API for transforming scripts into visual storyboards and generating images',
      contact: {
        name: 'SceneStitch API Support',
        email: 'support@scenestitch.com'
      }
    },
    servers: [
      {
        url: '/api',
        description: 'Development server'
      }
    ],
    components: {
      schemas: {
        Script: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'My Video Script' },
            content: { type: 'string', example: 'This is the script content...' },
            style: { type: 'string', example: 'comic' },
            projectType: { type: 'string', enum: ['video', 'blog', 'presentation'], example: 'video' },
            maintainContinuity: { type: 'boolean', example: true },
            customStylePrompt: { type: 'string', nullable: true, example: 'Custom style description' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Scene: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            scriptId: { type: 'integer', example: 1 },
            sceneNumber: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Opening Scene' },
            scriptExcerpt: { type: 'string', example: 'The story begins...' },
            dallePrompt: { type: 'string', example: 'A cinematic opening shot...' },
            soraPrompt: { type: 'string', nullable: true, example: 'Camera slowly pans across...' },
            imageUrl: { type: 'string', nullable: true, example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...' },
            estimatedDuration: { type: 'number', nullable: true, example: 5.5 },
            exactStartTime: { type: 'number', nullable: true, example: 0 },
            exactEndTime: { type: 'number', nullable: true, example: 5500 },
            isPinned: { type: 'boolean', example: false },
            overlayText: { type: 'string', nullable: true, example: 'Scene 1' }
          }
        },
        CreateScriptRequest: {
          type: 'object',
          required: ['content', 'style'],
          properties: {
            title: { type: 'string', example: 'My Video Script' },
            content: { type: 'string', example: 'This is the script content that will be transformed into scenes...' },
            style: { type: 'string', example: 'comic', description: 'Visual style for the storyboard' },
            projectType: { type: 'string', enum: ['video', 'blog', 'presentation'], example: 'video' },
            maintainContinuity: { type: 'boolean', example: true },
            customStylePrompt: { type: 'string', example: 'A custom style description' }
          }
        },
        GeneratePromptsRequest: {
          type: 'object',
          required: ['script', 'style'],
          properties: {
            script: { type: 'string', example: 'The script content...' },
            style: { type: 'string', example: 'comic' },
            projectType: { type: 'string', enum: ['video', 'blog', 'presentation'], example: 'video' },
            maintainContinuity: { type: 'boolean', example: true },
            customStylePrompt: { type: 'string', example: 'Custom style description' },
            referenceImageUrl: { type: 'string', example: 'https://example.com/image.jpg' }
          }
        },
        GenerateImagesRequest: {
          type: 'object',
          required: ['scenes'],
          properties: {
            scenes: {
              type: 'array',
              items: { $ref: '#/components/schemas/Scene' }
            },
            style: { type: 'string', example: 'comic' },
            maintainContinuity: { type: 'boolean', example: true },
            customStylePrompt: { type: 'string', example: 'Custom style description' },
            referenceImageUrl: { type: 'string', example: 'https://example.com/image.jpg' }
          }
        },
        ScriptToImagesRequest: {
          type: 'object',
          required: ['content', 'style'],
          properties: {
            title: { type: 'string', example: 'My Video Script' },
            content: { type: 'string', example: 'The complete script content...' },
            style: { type: 'string', example: 'comic' },
            projectType: { type: 'string', enum: ['video', 'blog', 'presentation'], example: 'video' },
            maintainContinuity: { type: 'boolean', example: true },
            customStylePrompt: { type: 'string', example: 'Custom style description' },
            referenceImageUrl: { type: 'string', example: 'https://example.com/image.jpg' }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error description' },
            error: { type: 'string', example: 'Detailed error message' }
          }
        }
      }
    }
  },
  apis: ['./server/routes.ts', './server/api/*.ts'], // paths to files containing OpenAPI definitions
};

const specs = swaggerJSDoc(options);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'SceneStitch API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true
    }
  }));
}

export { specs };
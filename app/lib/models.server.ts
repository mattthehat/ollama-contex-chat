import { db } from './db.server';
import { randomUUID } from 'crypto';

export type CustomModel = {
    modelId: number;
    modelUUID: string;
    modelName: string;
    modelDescription?: string;
    modelIcon: string;

    // Ollama Configuration
    ollamaModel: string;
    ollamaTemperature: number;
    ollamaTopP: number;
    ollamaTopK: number;
    ollamaRepeatPenalty: number;
    ollamaSeed?: number;

    // RAG Configuration
    useAdvancedRAG: boolean;
    ragMaxChunks: number;
    ragSimilarityThreshold: number;
    ragUseMultiQuery: boolean;
    ragUseHybridSearch: boolean;
    ragUseReranking: boolean;

    // System Prompt
    systemPrompt: string;

    // Context Settings
    maxContextTokens: number;
    maxOutputTokens: number;

    // Metadata
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
    isDefault: boolean;
};

export type CustomModelWithDocuments = CustomModel & {
    documents: Array<{
        documentId: number;
        documentUUID: string;
        documentTitle: string;
        documentType: string;
    }>;
};

export type CreateCustomModelData = {
    modelName: string;
    modelDescription?: string;
    modelIcon?: string;
    ollamaModel: string;
    ollamaTemperature?: number;
    ollamaTopP?: number;
    ollamaTopK?: number;
    ollamaRepeatPenalty?: number;
    ollamaSeed?: number;
    useAdvancedRAG?: boolean;
    ragMaxChunks?: number;
    ragSimilarityThreshold?: number;
    ragUseMultiQuery?: boolean;
    ragUseHybridSearch?: boolean;
    ragUseReranking?: boolean;
    systemPrompt: string;
    maxContextTokens?: number;
    maxOutputTokens?: number;
    documentIds?: number[];
};

/**
 * Get all custom models
 */
export async function getAllCustomModels(): Promise<CustomModel[]> {
    const result = await db.getData<CustomModel>(
        {
            table: 'custom_models',
            idField: 'modelId',
            fields: {
                modelId: 'modelId',
                modelUUID: 'modelUUID',
                modelName: 'modelName',
                modelDescription: 'modelDescription',
                modelIcon: 'modelIcon',
                ollamaModel: 'ollamaModel',
                ollamaTemperature: 'ollamaTemperature',
                ollamaTopP: 'ollamaTopP',
                ollamaTopK: 'ollamaTopK',
                ollamaRepeatPenalty: 'ollamaRepeatPenalty',
                ollamaSeed: 'ollamaSeed',
                useAdvancedRAG: 'useAdvancedRAG',
                ragMaxChunks: 'ragMaxChunks',
                ragSimilarityThreshold: 'ragSimilarityThreshold',
                ragUseMultiQuery: 'ragUseMultiQuery',
                ragUseHybridSearch: 'ragUseHybridSearch',
                ragUseReranking: 'ragUseReranking',
                systemPrompt: 'systemPrompt',
                maxContextTokens: 'maxContextTokens',
                maxOutputTokens: 'maxOutputTokens',
                createdAt: 'createdAt',
                updatedAt: 'updatedAt',
                isActive: 'isActive',
                isDefault: 'isDefault',
            },
            where: ['isActive = ?'],
            orderBy: ['modelName'],
            orderDirection: 'ASC',
        },
        [true]
    );

    // Sort to put default model first
    return result.rows.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return 0;
    });
}

/**
 * Get custom model by UUID
 */
export async function getCustomModelByUUID(
    uuid: string
): Promise<CustomModel | null> {
    const result = await db.getFirst<CustomModel>(
        {
            table: 'custom_models',
            idField: 'modelId',
            where: ['modelUUID = ?'],
            fields: {
                modelId: 'modelId',
                modelUUID: 'modelUUID',
                modelName: 'modelName',
                modelDescription: 'modelDescription',
                modelIcon: 'modelIcon',
                ollamaModel: 'ollamaModel',
                ollamaTemperature: 'ollamaTemperature',
                ollamaTopP: 'ollamaTopP',
                ollamaTopK: 'ollamaTopK',
                ollamaRepeatPenalty: 'ollamaRepeatPenalty',
                ollamaSeed: 'ollamaSeed',
                useAdvancedRAG: 'useAdvancedRAG',
                ragMaxChunks: 'ragMaxChunks',
                ragSimilarityThreshold: 'ragSimilarityThreshold',
                ragUseMultiQuery: 'ragUseMultiQuery',
                ragUseHybridSearch: 'ragUseHybridSearch',
                ragUseReranking: 'ragUseReranking',
                systemPrompt: 'systemPrompt',
                maxContextTokens: 'maxContextTokens',
                maxOutputTokens: 'maxOutputTokens',
                createdAt: 'createdAt',
                updatedAt: 'updatedAt',
                isActive: 'isActive',
                isDefault: 'isDefault',
            },
        },
        [uuid]
    );

    return result || null;
}

/**
 * Get custom model by ID
 */
export async function getCustomModelById(
    id: number
): Promise<CustomModel | null> {
    const result = await db.getFirst<CustomModel>(
        {
            table: 'custom_models',
            idField: 'modelId',
            where: ['modelId = ?'],
            fields: {
                modelId: 'modelId',
                modelUUID: 'modelUUID',
                modelName: 'modelName',
                modelDescription: 'modelDescription',
                modelIcon: 'modelIcon',
                ollamaModel: 'ollamaModel',
                ollamaTemperature: 'ollamaTemperature',
                ollamaTopP: 'ollamaTopP',
                ollamaTopK: 'ollamaTopK',
                ollamaRepeatPenalty: 'ollamaRepeatPenalty',
                ollamaSeed: 'ollamaSeed',
                useAdvancedRAG: 'useAdvancedRAG',
                ragMaxChunks: 'ragMaxChunks',
                ragSimilarityThreshold: 'ragSimilarityThreshold',
                ragUseMultiQuery: 'ragUseMultiQuery',
                ragUseHybridSearch: 'ragUseHybridSearch',
                ragUseReranking: 'ragUseReranking',
                systemPrompt: 'systemPrompt',
                maxContextTokens: 'maxContextTokens',
                maxOutputTokens: 'maxOutputTokens',
                createdAt: 'createdAt',
                updatedAt: 'updatedAt',
                isActive: 'isActive',
                isDefault: 'isDefault',
            },
        },
        [id]
    );

    return result || null;
}

/**
 * Get custom model with its associated documents
 */
export async function getCustomModelWithDocuments(
    uuid: string
): Promise<CustomModelWithDocuments | null> {
    const model = await getCustomModelByUUID(uuid);
    if (!model) return null;

    // Get associated documents
    const documentsResult = await db.rawQuery(
        `SELECT
            d.documentId,
            d.documentUUID,
            d.documentTitle,
            d.documentType
        FROM model_documents md
        INNER JOIN documents d ON md.documentId = d.documentId
        WHERE md.modelId = ?
        ORDER BY d.documentTitle ASC`,
        [model.modelId]
    );

    const documents = Array.isArray(documentsResult)
        ? documentsResult
        : (documentsResult as any)?.rows || [];

    return {
        ...model,
        documents,
    };
}

/**
 * Create a new custom model
 */
export async function createCustomModel(
    data: CreateCustomModelData
): Promise<string> {
    const modelUUID = randomUUID();

    await db.insertData('custom_models', {
        modelUUID,
        modelName: data.modelName,
        modelDescription: data.modelDescription || null,
        modelIcon: data.modelIcon || '🤖',
        ollamaModel: data.ollamaModel,
        ollamaTemperature: data.ollamaTemperature ?? 0.7,
        ollamaTopP: data.ollamaTopP ?? 0.9,
        ollamaTopK: data.ollamaTopK ?? 40,
        ollamaRepeatPenalty: data.ollamaRepeatPenalty ?? 1.1,
        ollamaSeed: data.ollamaSeed || null,
        useAdvancedRAG: data.useAdvancedRAG ?? true,
        ragMaxChunks: data.ragMaxChunks ?? 5,
        ragSimilarityThreshold: data.ragSimilarityThreshold ?? 0.1,
        ragUseMultiQuery: data.ragUseMultiQuery ?? true,
        ragUseHybridSearch: data.ragUseHybridSearch ?? true,
        ragUseReranking: data.ragUseReranking ?? true,
        systemPrompt: data.systemPrompt,
        maxContextTokens: data.maxContextTokens ?? 16384,
        maxOutputTokens: data.maxOutputTokens ?? 4096,
        isActive: true,
        isDefault: false,
    });

    // Get the created model
    const model = await getCustomModelByUUID(modelUUID);
    if (!model) {
        throw new Error('Failed to create custom model');
    }

    // Associate documents if provided
    if (data.documentIds && data.documentIds.length > 0) {
        await setModelDocuments(model.modelId, data.documentIds);
    }

    return modelUUID;
}

/**
 * Update a custom model
 */
export async function updateCustomModel(
    uuid: string,
    data: Partial<CreateCustomModelData>
): Promise<boolean> {
    const model = await getCustomModelByUUID(uuid);
    if (!model) return false;

    const updateData: any = {};

    if (data.modelName !== undefined) updateData.modelName = data.modelName;
    if (data.modelDescription !== undefined)
        updateData.modelDescription = data.modelDescription;
    if (data.modelIcon !== undefined) updateData.modelIcon = data.modelIcon;
    if (data.ollamaModel !== undefined)
        updateData.ollamaModel = data.ollamaModel;
    if (data.ollamaTemperature !== undefined)
        updateData.ollamaTemperature = data.ollamaTemperature;
    if (data.ollamaTopP !== undefined) updateData.ollamaTopP = data.ollamaTopP;
    if (data.ollamaTopK !== undefined) updateData.ollamaTopK = data.ollamaTopK;
    if (data.ollamaRepeatPenalty !== undefined)
        updateData.ollamaRepeatPenalty = data.ollamaRepeatPenalty;
    if (data.ollamaSeed !== undefined) updateData.ollamaSeed = data.ollamaSeed;
    if (data.useAdvancedRAG !== undefined)
        updateData.useAdvancedRAG = data.useAdvancedRAG;
    if (data.ragMaxChunks !== undefined)
        updateData.ragMaxChunks = data.ragMaxChunks;
    if (data.ragSimilarityThreshold !== undefined)
        updateData.ragSimilarityThreshold = data.ragSimilarityThreshold;
    if (data.ragUseMultiQuery !== undefined)
        updateData.ragUseMultiQuery = data.ragUseMultiQuery;
    if (data.ragUseHybridSearch !== undefined)
        updateData.ragUseHybridSearch = data.ragUseHybridSearch;
    if (data.ragUseReranking !== undefined)
        updateData.ragUseReranking = data.ragUseReranking;
    if (data.systemPrompt !== undefined)
        updateData.systemPrompt = data.systemPrompt;
    if (data.maxContextTokens !== undefined)
        updateData.maxContextTokens = data.maxContextTokens;
    if (data.maxOutputTokens !== undefined)
        updateData.maxOutputTokens = data.maxOutputTokens;

    // Update model if there are changes
    if (Object.keys(updateData).length > 0) {
        await db.updateData({
            table: 'custom_models',
            data: updateData,
            where: ['modelId = ?'],
            values: [model.modelId],
        });
    }

    // Update documents if provided
    if (data.documentIds !== undefined) {
        await setModelDocuments(model.modelId, data.documentIds);
    }

    return true;
}

/**
 * Set documents for a model (replaces existing associations)
 */
async function setModelDocuments(
    modelId: number,
    documentIds: number[]
): Promise<void> {
    // Remove existing associations
    await db.rawQuery('DELETE FROM model_documents WHERE modelId = ?', [
        modelId,
    ]);

    // Add new associations
    if (documentIds.length > 0) {
        for (const documentId of documentIds) {
            await db.insertData('model_documents', {
                modelId,
                documentId,
            });
        }
    }
}

/**
 * Get document IDs associated with a model
 */
export async function getModelDocumentIds(modelId: number): Promise<number[]> {
    const result = await db.rawQuery(
        'SELECT documentId FROM model_documents WHERE modelId = ?',
        [modelId]
    );

    const rows = Array.isArray(result) ? result : (result as any)?.rows || [];
    return rows.map((row: any) => row.documentId);
}

/**
 * Delete a custom model (soft delete)
 */
export async function deleteCustomModel(uuid: string): Promise<boolean> {
    const model = await getCustomModelByUUID(uuid);
    if (!model || model.isDefault) {
        return false; // Cannot delete default model
    }

    await db.updateData({
        table: 'custom_models',
        data: { isActive: false },
        where: ['modelId = ?'],
        values: [model.modelId],
    });

    return true;
}

/**
 * Get default model
 */
export async function getDefaultModel(): Promise<CustomModel | null> {
    const result = await db.getFirst<CustomModel>(
        {
            table: 'custom_models',
            idField: 'modelId',
            where: ['isDefault = ? AND isActive = ?'],
            fields: {
                modelId: 'modelId',
                modelUUID: 'modelUUID',
                modelName: 'modelName',
                modelDescription: 'modelDescription',
                modelIcon: 'modelIcon',
                ollamaModel: 'ollamaModel',
                ollamaTemperature: 'ollamaTemperature',
                ollamaTopP: 'ollamaTopP',
                ollamaTopK: 'ollamaTopK',
                ollamaRepeatPenalty: 'ollamaRepeatPenalty',
                ollamaSeed: 'ollamaSeed',
                useAdvancedRAG: 'useAdvancedRAG',
                ragMaxChunks: 'ragMaxChunks',
                ragSimilarityThreshold: 'ragSimilarityThreshold',
                ragUseMultiQuery: 'ragUseMultiQuery',
                ragUseHybridSearch: 'ragUseHybridSearch',
                ragUseReranking: 'ragUseReranking',
                systemPrompt: 'systemPrompt',
                maxContextTokens: 'maxContextTokens',
                maxOutputTokens: 'maxOutputTokens',
                createdAt: 'createdAt',
                updatedAt: 'updatedAt',
                isActive: 'isActive',
                isDefault: 'isDefault',
            },
        },
        [true, true]
    );

    return result || null;
}

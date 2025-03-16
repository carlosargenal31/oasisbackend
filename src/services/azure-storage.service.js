// src/services/azure-storage.service.js
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

class AzureStorageService {
  constructor() {
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'property-images';
    
    if (!this.accountName || !this.accountKey) {
      console.warn('Azure Storage credentials not found in environment variables');
    } else {
      const sharedKeyCredential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
      const blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
      this.containerClient = blobServiceClient.getContainerClient(this.containerName);
    }
  }

  async createContainerIfNotExists() {
    try {
      await this.containerClient.createIfNotExists({
        access: 'blob' // Acceso público para las imágenes
      });
      console.log(`Container "${this.containerName}" created or already exists`);
    } catch (error) {
      console.error('Error creating container:', error);
      throw error;
    }
  }

  async uploadImage(file, propertyId) {
    try {
      // Aseguramos que el contenedor existe
      await this.createContainerIfNotExists();
      
      // Crear un nombre único para el archivo
      const extension = file.originalname.split('.').pop();
      const fileName = `property-${propertyId}-${uuidv4()}.${extension}`;
      
      // Obtener el cliente del blob
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      
      // Subir el archivo
      await blockBlobClient.upload(file.buffer, file.buffer.length, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype
        }
      });
      
      // Devolver la URL del blob
      const imageUrl = blockBlobClient.url;
      return imageUrl;
    } catch (error) {
      console.error('Error uploading image to Azure Storage:', error);
      throw error;
    }
  }

  async deleteImage(imageUrl) {
    try {
      // Extraer el nombre del blob de la URL
      const blobName = imageUrl.split('/').pop();
      
      // Obtener el cliente del blob
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      
      // Eliminar el blob
      await blockBlobClient.delete();
      console.log(`Blob "${blobName}" deleted successfully`);
      return true;
    } catch (error) {
      console.error('Error deleting image from Azure Storage:', error);
      throw error;
    }
  }

  // Método para generar URLs SAS (Shared Access Signature) para acceso temporal
  async generateSasUrl(blobName, expiryMinutes = 60) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      
      // Calcular la fecha de expiración
      const expiryTime = new Date();
      expiryTime.setMinutes(expiryTime.getMinutes() + expiryMinutes);
      
      // Generar la URL SAS
      const sasUrl = await blockBlobClient.generateSasUrl({
        expiresOn: expiryTime,
        permissions: 'r', // Solo lectura
      });
      
      return sasUrl;
    } catch (error) {
      console.error('Error generating SAS URL:', error);
      throw error;
    }
  }
}

export const azureStorageService = new AzureStorageService();
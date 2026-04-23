import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

class StorageService {
  private s3: S3Client;
  private bucket: string;

  constructor() {
	this.bucket = process.env.AWS_S3_BUCKET_NAME!;
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string): Promise<string> {
    const ext = path.extname(file.originalname) || '.jpg';
    const key = `${folder}/${uuidv4()}${ext}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL: 'public-read',
    }));

    return this.buildUrl(key);
  }

  async deleteFile(url: string): Promise<void> {
    const key = this.extractKey(url);
    if (!key) return;

    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  private buildUrl(key: string): string {
    if (process.env.S3_ENDPOINT) {
      return `${process.env.S3_ENDPOINT}/${this.bucket}/${key}`;
    }
    return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  private extractKey(url: string): string | null {
    try {
      const pathname = new URL(url).pathname;
      // pathname = /bucket-name/avatars/... или /avatars/... в зависимости от провайдера
      const withoutBucket = pathname.replace(`/${this.bucket}/`, '/');
      return withoutBucket.slice(1);
    } catch {
      return null;
    }
  }
}

export default StorageService;
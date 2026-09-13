-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

-- CreateTable
CREATE TABLE "ApiIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "auth" JSONB NOT NULL,
    "secretCipher" BYTEA,
    "defaultHeaders" JSONB NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiEndpoint" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" "HttpMethod" NOT NULL,
    "path" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "body" TEXT,
    "resultPath" TEXT NOT NULL DEFAULT '',
    "sampleResponse" JSONB,
    "sampledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiIntegration_workspaceId_idx" ON "ApiIntegration"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiIntegration_workspaceId_slug_key" ON "ApiIntegration"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "ApiEndpoint_integrationId_idx" ON "ApiEndpoint"("integrationId");

-- AddForeignKey
ALTER TABLE "ApiIntegration" ADD CONSTRAINT "ApiIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiEndpoint" ADD CONSTRAINT "ApiEndpoint_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ApiIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

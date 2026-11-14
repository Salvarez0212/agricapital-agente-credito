-- CreateTable
CREATE TABLE "conversaciones" (
    "id" UUID NOT NULL,
    "telefono" VARCHAR(16) NOT NULL,
    "cedula" VARCHAR(10),
    "tipo_cliente" "TipoCliente",
    "consentimiento_at" TIMESTAMP(3),
    "solicitud_id" UUID,
    "mensajes" JSONB NOT NULL DEFAULT '[]',
    "ultimo_mensaje_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversaciones_telefono_ultimo_mensaje_at_idx" ON "conversaciones"("telefono", "ultimo_mensaje_at");

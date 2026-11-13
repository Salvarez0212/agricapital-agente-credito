-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PREFERENCIAL', 'ANTIGUO', 'NUEVO');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('EN_REVISION', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "CanalSolicitud" AS ENUM ('WHATSAPP', 'WEB');

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "cedula" VARCHAR(10) NOT NULL,
    "nombre_completo" VARCHAR(120) NOT NULL,
    "telefono" VARCHAR(16) NOT NULL,
    "municipio" VARCHAR(80) NOT NULL,
    "cupo_preaprobado" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes" (
    "id" UUID NOT NULL,
    "cliente_id" UUID,
    "cedula" VARCHAR(10) NOT NULL,
    "nombre_completo" VARCHAR(120) NOT NULL,
    "telefono" VARCHAR(16) NOT NULL,
    "municipio" VARCHAR(80) NOT NULL,
    "tipo_cliente" "TipoCliente" NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'EN_REVISION',
    "canal" "CanalSolicitud" NOT NULL DEFAULT 'WHATSAPP',
    "monto_solicitado" DECIMAL(14,2),
    "requiere_verificacion" BOOLEAN NOT NULL DEFAULT false,
    "consentimiento_datos_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cedula_key" ON "clientes"("cedula");

-- CreateIndex
CREATE INDEX "clientes_telefono_idx" ON "clientes"("telefono");

-- CreateIndex
CREATE INDEX "solicitudes_cedula_idx" ON "solicitudes"("cedula");

-- CreateIndex
CREATE INDEX "solicitudes_telefono_idx" ON "solicitudes"("telefono");

-- CreateIndex
CREATE INDEX "solicitudes_created_at_idx" ON "solicitudes"("created_at");

-- AddForeignKey
ALTER TABLE "solicitudes" ADD CONSTRAINT "solicitudes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

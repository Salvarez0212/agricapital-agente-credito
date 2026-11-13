/**
 * Datos 100 % ficticios para desarrollo y demo.
 * Cédulas, nombres y teléfonos no corresponden a personas reales.
 */

export interface ClienteSeed {
  cedula: string;
  nombreCompleto: string;
  telefono: string;
  municipio: string;
  cupoPreaprobado: number | null;
}

/** Clientes preferenciales: ya tuvieron crédito y tienen cupo preaprobado. */
export const preferenciales: ClienteSeed[] = [
  {
    cedula: '1010101010',
    nombreCompleto: 'María Fernanda Rojas Gil',
    telefono: '+573000000101',
    municipio: 'Villavicencio',
    cupoPreaprobado: 8_000_000,
  },
  {
    cedula: '1020202020',
    nombreCompleto: 'Jorge Andrés Pineda Leal',
    telefono: '+573000000102',
    municipio: 'Tunja',
    cupoPreaprobado: 15_000_000,
  },
  {
    cedula: '1030303030',
    nombreCompleto: 'Luz Marina Cárdenas Ortiz',
    telefono: '+573000000103',
    municipio: 'Ibagué',
    cupoPreaprobado: 5_500_000,
  },
  {
    cedula: '1040404040',
    nombreCompleto: 'Carlos Eduardo Vanegas Ríos',
    telefono: '+573000000104',
    municipio: 'Neiva',
    cupoPreaprobado: 22_000_000,
  },
  {
    cedula: '1050505050',
    nombreCompleto: 'Ana Lucía Moreno Duarte',
    telefono: '+573000000105',
    municipio: 'Montería',
    cupoPreaprobado: 3_000_000,
  },
  {
    cedula: '1060606060',
    nombreCompleto: 'Héctor Julio Salcedo Peña',
    telefono: '+573000000106',
    municipio: 'Yopal',
    cupoPreaprobado: 12_000_000,
  },
  {
    cedula: '1070707070',
    nombreCompleto: 'Diana Patricia Quintero Mesa',
    telefono: '+573000000107',
    municipio: 'Duitama',
    cupoPreaprobado: 9_750_000,
  },
];

/** Clientes antiguos no preferenciales: ya tuvieron crédito, sin cupo preaprobado. */
export const antiguos: ClienteSeed[] = [
  {
    cedula: '2010101010',
    nombreCompleto: 'Pedro Antonio Gómez Ariza',
    telefono: '+573000000201',
    municipio: 'Sogamoso',
    cupoPreaprobado: null,
  },
  {
    cedula: '2020202020',
    nombreCompleto: 'Rosa Elena Bermúdez Castro',
    telefono: '+573000000202',
    municipio: 'Pasto',
    cupoPreaprobado: null,
  },
  {
    cedula: '2030303030',
    nombreCompleto: 'Luis Fernando Arango Toro',
    telefono: '+573000000203',
    municipio: 'Popayán',
    cupoPreaprobado: 0,
  },
  {
    cedula: '2040404040',
    nombreCompleto: 'Gloria Inés Vargas Lozano',
    telefono: '+573000000204',
    municipio: 'Garzón',
    cupoPreaprobado: null,
  },
  {
    cedula: '2050505050',
    nombreCompleto: 'Óscar Iván Restrepo Cano',
    telefono: '+573000000205',
    municipio: 'Fusagasugá',
    cupoPreaprobado: null,
  },
  {
    cedula: '2060606060',
    nombreCompleto: 'Sandra Milena Ospina Rueda',
    telefono: '+573000000206',
    municipio: 'Chiquinquirá',
    cupoPreaprobado: null,
  },
];

/**
 * Clientes de demo: si se define DEMO_PHONE en el .env, el seed los crea con ese
 * teléfono para poder probar los flujos preferencial y antiguo desde WhatsApp real.
 */
export function clientesDemo(telefono: string): ClienteSeed[] {
  return [
    {
      cedula: '9000000001',
      nombreCompleto: 'Cliente Demo Preferencial',
      telefono,
      municipio: 'Villavicencio',
      cupoPreaprobado: 10_000_000,
    },
    {
      cedula: '9000000002',
      nombreCompleto: 'Cliente Demo Antiguo',
      telefono,
      municipio: 'Tunja',
      cupoPreaprobado: null,
    },
  ];
}

/** Solicitudes de ejemplo para que el panel no arranque vacío. */
export const solicitudesEjemplo = [
  { cedula: '1010101010', montoSolicitado: 6_000_000, diasAtras: 1 },
  { cedula: '2010101010', montoSolicitado: null, diasAtras: 2 },
  { cedula: '1040404040', montoSolicitado: 20_000_000, diasAtras: 3 },
  {
    cedula: '3010101010',
    nuevo: {
      nombreCompleto: 'Camila Andrea Torres Niño',
      telefono: '+573000000301',
      municipio: 'Zipaquirá',
    },
    montoSolicitado: 2_000_000,
    diasAtras: 0,
  },
  {
    cedula: '3020202020',
    nuevo: {
      nombreCompleto: 'Julián David Herrera Soto',
      telefono: '+573000000302',
      municipio: 'Granada',
    },
    montoSolicitado: null,
    diasAtras: 5,
  },
] as const;

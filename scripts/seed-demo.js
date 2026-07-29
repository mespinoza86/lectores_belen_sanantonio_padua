require('dotenv').config();
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const roles = ['Primera lectura', 'Segunda lectura', 'Salmo', 'Moniciones'];
const schedules = [
  { key: 'sat-1600', name: 'Misa sábado 4:00 p. m.', time: '16:00', weekday: 6 },
  { key: 'sat-1800', name: 'Misa sábado 6:00 p. m.', time: '18:00', weekday: 6 },
  { key: 'sun-0700', name: 'Misa domingo 7:00 a. m.', time: '07:00', weekday: 0 },
  { key: 'sun-1100', name: 'Misa domingo 11:00 a. m.', time: '11:00', weekday: 0 },
  { key: 'sun-1600', name: 'Misa domingo 4:00 p. m.', time: '16:00', weekday: 0 },
  { key: 'sun-1800', name: 'Misa domingo 6:00 p. m.', time: '18:00', weekday: 0 }
];
const names = [
  'María Fernanda Rojas', 'José Andrés Vargas', 'Ana Lucía Jiménez', 'Carlos Eduardo Mora',
  'Sofía Hernández Solano', 'Daniel Alberto Castro', 'Valeria Gómez Chaves', 'Luis Fernando Ramírez',
  'Gabriela Rodríguez León', 'Miguel Ángel Sánchez', 'Camila Araya Quesada', 'Jorge Arturo López',
  'Daniela Salazar Méndez', 'Ricardo Antonio Brenes', 'Natalia Villalobos Ruiz', 'Esteban Aguilar Soto',
  'Paola Andrea Cordero', 'Andrés Felipe Montero', 'Laura Cristina Zúñiga', 'Diego Alejandro Porras',
  'Mónica Patricia Solís', 'Fernando José Alvarado', 'Isabella Navarro Arias', 'Óscar Gerardo Fallas',
  'Adriana María Campos', 'Sebastián Calderón Vega', 'Karla Vanessa Murillo', 'Mauricio Herrera Rojas',
  'Lucía Elena Espinoza', 'Pablo Ignacio Chacón',
  'Alejandra María Segura', 'Cristian Alberto Ureña', 'Beatriz Elena Madrigal', 'Tomás Eduardo Céspedes',
  'Mariana Isabel Quirós', 'Felipe Andrés Acuña', 'Rocío del Carmen Alfaro', 'Kevin Josué Barboza',
  'Silvia Patricia Carvajal', 'Juan Diego Esquivel', 'Elena Victoria Fonseca', 'Roberto Carlos Gamboa',
  'Andrea Tatiana Hidalgo', 'Marco Antonio Leitón', 'Melissa Alexandra Matarrita', 'David Esteban Naranjo',
  'Claudia Marcela Obando', 'Jonathan Daniel Picado', 'Verónica Isabel Retana', 'Álvaro José Valverde'
];

function phone(index) {
  const value = 60000000 + ((index * 739391 + 184627) % 29999999);
  const text = String(value).padStart(8, '0');
  return `${text.slice(0, 4)}-${text.slice(4)}`;
}

function availabilityFor(index, massIds) {
  const count = 2 + (index % 4);
  return Array.from({ length: count }, (_, offset) => massIds[(index + offset * 5) % massIds.length]);
}

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'lectores_parroquia');
  const masses = db.collection('masses');
  const readers = db.collection('readers');

  const existingSaturday = await masses.find({ name: { $in: ['sabado_4pm', 'sabado_6pm'] } }).toArray();
  for (const schedule of schedules) {
    const oldName = schedule.key === 'sat-1600' ? 'sabado_4pm' : schedule.key === 'sat-1800' ? 'sabado_6pm' : null;
    const existing = await masses.findOne({ $or: [{ key: schedule.key }, ...(oldName ? [{ name: oldName }] : [])] });
    const id = existing?.id || crypto.randomUUID();
    await masses.updateOne(
      { id },
      { $set: { ...schedule, id, roles, type: 'weekly', date: null, active: true }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }

  // Conserva una sola misa por horario si una carga anterior creó duplicados.
  for (const schedule of schedules) {
    const duplicates = await masses.find({ key: schedule.key }).sort({ createdAt: 1 }).toArray();
    if (duplicates.length < 2) continue;
    const canonicalId = duplicates[0].id;
    for (const duplicate of duplicates.slice(1)) {
      const affectedReaders = await readers.find({ availability: duplicate.id }).toArray();
      for (const reader of affectedReaders) {
        const availability = [...new Set((reader.availability || []).map(id => id === duplicate.id ? canonicalId : id))];
        await readers.updateOne({ _id: reader._id }, { $set: { availability } });
      }
      await db.collection('assignments').updateMany({ massId: duplicate.id }, { $set: { massId: canonicalId } });
      await masses.deleteOne({ _id: duplicate._id });
    }
  }

  const seededMasses = await masses.find({ key: { $in: schedules.map(s => s.key) } }).sort({ weekday: 1, time: 1 }).toArray();
  const massIds = seededMasses.map(m => m.id);
  for (let index = 0; index < names.length; index++) {
    const seedKey = `demo-reader-${String(index + 1).padStart(2, '0')}`;
    const existing = await readers.findOne({ seedKey });
    const id = existing?.id || crypto.randomUUID();
    await readers.updateOne(
      { id },
      { $set: { id, seedKey, name: names[index], phone: phone(index), notes: '', availability: availabilityFor(index, massIds), active: true }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }

  console.log(`Carga completa: ${names.length} lectores de prueba y ${seededMasses.length} misas configuradas.`);
  await client.close();
}

run().catch(error => { console.error(error); process.exitCode = 1; });

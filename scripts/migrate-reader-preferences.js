require('dotenv').config();
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('Falta MONGODB_URI en .env');
if (!process.argv.includes('--apply')) throw new Error('Ejecuta este script con --apply para confirmar la migración');

function randomItem(values) {
  return values[crypto.randomInt(values.length)];
}

async function run() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const database = client.db('lectores_parroquia');
    const [readers,masses,assignments] = await Promise.all([
      database.collection('readers').find({}).sort({ createdAt: 1, name: 1 }).toArray(),
      database.collection('masses').find({ active: true }).sort({ weekday: 1, time: 1 }).toArray(),
      database.collection('assignments').find({}).toArray()
    ]);
    if (!masses.length) throw new Error('No hay misas activas para generar preferencias');
    const massIds=masses.map(mass=>mass.id);
    const assignedMassesByReader=new Map(readers.map(reader=>[reader.id,new Set()]));
    assignments.forEach(assignment=>{
      if(assignment.readerId&&assignedMassesByReader.has(assignment.readerId))assignedMassesByReader.get(assignment.readerId).add(assignment.massId);
      (assignment.substituteIds||[]).forEach(readerId=>assignedMassesByReader.get(readerId)?.add(assignment.massId));
    });
    const offset=crypto.randomInt(massIds.length);
    const updates=readers.map((reader,index)=>{
      const preferred=new Set(assignedMassesByReader.get(reader.id));
      preferred.add(massIds[(index+offset)%massIds.length]);
      if(massIds.length>1&&crypto.randomInt(2)===1)preferred.add(randomItem(massIds));
      const unavailableCandidates=massIds.filter(id=>!preferred.has(id));
      const unavailableMassIds=unavailableCandidates.length&&crypto.randomInt(100)<35?[randomItem(unavailableCandidates)]:[];
      const preferredMassIds=[...preferred];
      return {
        updateOne:{
          filter:{id:reader.id},
          update:{$set:{preferredMassIds,unavailableMassIds,availability:preferredMassIds,preferenceModel:1}}
        }
      };
    });
    const session=client.startSession();
    try {
      await session.withTransaction(async()=>{
        if(updates.length)await database.collection('readers').bulkWrite(updates,{session});
      });
    } finally {
      await session.endSession();
    }
    console.log(`Preferencias generadas para ${readers.length} lectores ficticios en ${masses.length} misas activas.`);
  } finally {
    await client.close();
  }
}

run().catch(error=>{console.error(`No se pudo migrar: ${error.message}`);process.exitCode=1});

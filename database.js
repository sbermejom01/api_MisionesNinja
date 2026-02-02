const fs = require('fs');
const path = require('path');

// En Vercel, el sistema de archivos es de solo lectura excepto /tmp
const isVercel = process.env.VERCEL || process.env.NOW_REGION;
const DATA_FILE = isVercel
    ? path.join('/tmp', 'data.json')
    : path.join(__dirname, 'data.json');

// Función para asegurar que el archivo existe en /tmp al iniciar
const initializeDataFile = () => {
    if (isVercel && !fs.existsSync(DATA_FILE)) {
        try {
            const originalPath = path.join(__dirname, 'data.json');
            if (fs.existsSync(originalPath)) {
                const initialData = fs.readFileSync(originalPath, 'utf8');
                fs.writeFileSync(DATA_FILE, initialData, 'utf8');
                console.log('Archivo data.json inicializado en /tmp');
            } else {
                const defaultData = { ninjas: [], missions: [], assignments: [] };
                fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
                console.log('Archivo data.json creado de cero en /tmp');
            }
        } catch (error) {
            console.error('Error inicializando data.json en /tmp:', error);
        }
    }
};

initializeDataFile();

const readData = () => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return { ninjas: [], missions: [], assignments: [] };
        }
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error reading data:', error);
        return { ninjas: [], missions: [], assignments: [] };
    }
};

const writeData = (data) => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing data:', error);
    }
};

module.exports = {
    readData,
    writeData
};


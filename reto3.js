import http from 'k6/http';
import { sleep } from 'k6';
// Configuración del escenario
export const options = {
 scenarios: {
   dynamic_payload_scenario: {
     executor: 'per-vu-iterations', // Controla las iteraciones por VU
     vus: 1, // Solo 1 usuario virtual para controlar las peticiones
     iterations: 140, // Total de peticiones: 6 minutos * 20 peticiones/minuto
     maxDuration: '8m', // Duración máxima de la prueba
   },
 },
};
// Control para iniciar justo en el segundo 00
const now = new Date();
const delay = 60 - now.getSeconds(); // Tiempo hasta el próximo minuto
if (delay < 60) {
 console.log(`Esperando ${delay} segundos para iniciar en el segundo 00...`);
 sleep(delay); // Esperar hasta el segundo 00 solo una vez
}
let currentIteration = 0; // Iteración actual
export default function () {
 // Determinar el minuto actual según la iteración
 const minute = Math.floor(currentIteration / 20) + 1;
 // Configurar el valor de Error dependiendo del minuto actual
 let errorValue = false;
 if (minute === 1) {
   // En el minuto 1, 5 de 20 peticiones tienen Error = True
   errorValue = currentIteration % 20 < 5;
 } else if (minute === 3) {
   // En el minuto 3, 15 de 20 peticiones tienen Error = True
   errorValue = currentIteration % 20 < 15;
 } else if (minute === 5) {
   // En el minuto 5, las primeras 10 de 20 peticiones tienen Error = True
   errorValue = currentIteration % 20 < 15;
 } else {
   // Minutos 2, 4 y 6, todas las peticiones tienen Error = False
   errorValue = false;
 }
 // Payload de la solicitud
 const payload = JSON.stringify({
   message: 'Test payload with dynamic error',
   timestamp: new Date().toISOString(),
   error: errorValue, // Valor dinámico de Error
 });
 // Configurar el encabezado
 const headers = { 'Content-Type': 'application/json' };
 // Enviar la solicitud POST
 const url = 'https://nsc1g8yts9.execute-api.us-east-2.amazonaws.com/prod/service-api';
 const response = http.post(url, payload, { headers });
 // Mostrar en consola la iteración actual y el valor del Error
 console.log(
   `Minute: ${minute}, Iteration: ${currentIteration + 1}, Error: ${errorValue}, Status: ${response.status}, Message: ${response.body}`
 );
 // Incrementar la iteración actual
 currentIteration++;
 // Pausa para garantizar 20 solicitudes por minuto (3 segundos entre solicitudes)
 sleep(3);
}
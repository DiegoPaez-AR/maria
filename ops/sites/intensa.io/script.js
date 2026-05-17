// Step interaction
const steps = document.querySelectorAll('.step');
const stepLabel = document.getElementById('stepLabel');
const visualContent = document.getElementById('visualContent');

const stepData = {
  1: { label: 'step 01 / mapeo', nodes: [
    ['active', 'análisis de proceso · cuentas por pagar'],
    ['pending', 'identificando entradas y salidas'],
    ['idle', 'definiendo criterios de éxito'],
    ['idle', 'documentando excepciones']
  ]},
  2: { label: 'step 02 / conexión', nodes: [
    ['active', 'SAP S/4HANA · oauth conectado'],
    ['active', 'permisos de lectura · ok'],
    ['pending', 'salesforce · sandbox sync'],
    ['idle', 'gmail api · pendiente de aprobación']
  ]},
  3: { label: 'step 03 / despliegue', nodes: [
    ['active', 'shadow mode · 247 ejecuciones'],
    ['active', 'precisión vs humano: 96.4%'],
    ['pending', 'calibrando umbrales de confianza'],
    ['idle', 'reporte semanal listo · viernes']
  ]},
  4: { label: 'step 04 / operación', nodes: [
    ['active', 'producción · 14d en vivo'],
    ['active', '4,812 ejecuciones · 99.2% éxito'],
    ['active', 'ahorro acumulado: 312h'],
    ['pending', 'mejora en cola · v2.1']
  ]}
};

steps.forEach(step => {
  step.addEventListener('click', () => {
    steps.forEach(s => s.classList.remove('active'));
    step.classList.add('active');
    const data = stepData[step.dataset.step];
    stepLabel.textContent = data.label;
    visualContent.innerHTML = data.nodes.map((n, i) => `
      <div class="visual-node"><span class="status ${n[0] === 'active' ? '' : n[0]}"></span> ${n[1]}</div>
      ${i < data.nodes.length - 1 ? '<div class="visual-arrow"></div>' : ''}
    `).join('');
  });
});

// Auto-cycle steps
let currentStep = 1;
setInterval(() => {
  currentStep = (currentStep % 4) + 1;
  document.querySelector(`.step[data-step="${currentStep}"]`).click();
}, 4500);

// Reveal on scroll
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

/**
 * RBM Sistema de Kick-off e Onboarding - Lógica de Negócio (JavaScript)
 * Armazenamento IndexedDB, Autopreenchimento CEP, Cálculo de Idades,
 * Anexos Base64 (Empresa e Sócio), Importação/Exportação JSON,
 * Impressão A4 e Integração com Banco de Dados em Nuvem (Supabase).
 * Todos os campos são de preenchimento opcional conforme solicitação do usuário.
 */

const DB_NAME = 'RBM_Kickoff_DB';
const DB_VERSION = 1;
const STORE_NAME = 'kickoffs';

let db = null;
let partnerIdCounter = 0;

// --- CONFIGURAÇÃO PADRÃO DA NUVEM (SUPABASE) ---
const DEFAULT_CLOUD_CONFIG = {
  url: 'https://kbnhbdurbaseadwmrflk.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtibmhiZHVyYmFzZWFkd21yZmxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDU5MzIsImV4cCI6MjA5OTU4MTkzMn0.0tGgLHFuJc1S6aLyw3E7GgaKIkEQVsCep6S2aSLF2Xk',
  active: true
};

// --- CONFIGURAÇÃO DE NOTIFICAÇÃO DE E-MAIL ---
const EMAIL_NOTIFICATION_CONFIG = {
  active: true, 
  toEmail: 'comercial@rbmcontabil.com.br' 
};

function getCloudConfig() {
  const saved = localStorage.getItem('rbm_cloud_config');
  let config = { ...DEFAULT_CLOUD_CONFIG };
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Só sobrescreve se o usuário preencheu de fato dados válidos na interface
      if (parsed && parsed.url && parsed.key) {
        config = parsed;
      }
    } catch (e) {
      console.error("Erro ao ler config da nuvem local:", e);
    }
  }
  // Higieniza a URL removendo barras finais e o fragmento /rest/v1
  if (config.url) {
    config.url = config.url.trim().replace(/\/+$/, '');
    config.url = config.url.replace(/\/rest\/v1$/, '');
  }
  return config;
}

// --- CONFIGURAÇÃO E IDENTIFICAÇÃO DO MODO CLIENTE ---
function checkClientMode() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('mode') === 'client' || params.get('cliente') === 'true');
}

function applyClientMode() {
  // Exibe a tela de boas-vindas e oculta o formulário
  const welcomeCard = document.getElementById('welcome-selection-card');
  if (welcomeCard) welcomeCard.style.display = 'flex';
  
  const formCard = document.querySelector('.form-card');
  if (formCard) formCard.style.display = 'none';

  // Oculta abas superiores
  const navTabs = document.querySelector('.nav-tabs');
  if (navTabs) navTabs.style.display = 'none';

  // Oculta botão de cancelar formulário
  const cancelBtn = document.getElementById('btn-cancel-form');
  if (cancelBtn) cancelBtn.style.display = 'none';

  // Oculta seção 7 (Dados de Implantação e Observações Internas RBM)
  const section7 = document.getElementById('form-section-7');
  if (section7) section7.style.display = 'none';

  // Altera texto do botão de salvar
  const saveBtn = document.getElementById('btn-save-client');
  if (saveBtn) {
    saveBtn.textContent = 'Enviar Formulário';
  }

  // Personaliza o título no cabeçalho
  const brandTitle = document.querySelector('.brand-title');
  if (brandTitle) brandTitle.textContent = 'RBM CONTABILIDADE';
  const brandSubtitle = document.querySelector('.brand-subtitle');
  if (brandSubtitle) brandSubtitle.textContent = 'Ficha de Onboarding do Cliente';

  // Controle do botão de Acesso Restrito no header:
  // Se a URL tiver explicitamente "?cliente=true" ou "?mode=client", ocultamos o botão "Acesso Restrito" por completo
  const params = new URLSearchParams(window.location.search);
  const strictClient = (params.get('mode') === 'client' || params.get('cliente') === 'true');
  const adminToggleBtn = document.getElementById('btn-admin-toggle');
  
  if (strictClient) {
    if (adminToggleBtn) adminToggleBtn.style.display = 'none';
  } else {
    if (adminToggleBtn) adminToggleBtn.style.display = 'inline-block';
  }

  // Garante que os botões administrativos individuais no header fiquem ocultos
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => el.style.display = 'none');
}

async function sendEmailNotification(kickoff) {
  if (!EMAIL_NOTIFICATION_CONFIG.active || !EMAIL_NOTIFICATION_CONFIG.toEmail) {
    console.log("Notificacao de e-mail inativa.");
    return;
  }
  
  try {
    const payload = {
      _subject: `Novo Kick-off Recebido: ${kickoff.company.razaoSocial || 'Empresa sem Razao Social'}`,
      _template: 'table',
      "Tipo de Processo": kickoff.company.prevAccountingHas === 'Migracao' || kickoff.company.prevAccountingHas === 'Sim' ? 'Migracao de Contabilidade' : 'Abertura de Empresa Nova',
      "Razao Social": kickoff.company.razaoSocial || 'Empresa sem Razao Social',
      "CNPJ": kickoff.company.cnpj || 'Nao Informado',
      "E-mail da Empresa": kickoff.company.email || 'Nao Informado',
      "Telefone da Empresa": kickoff.company.telefone || 'Nao Informado',
      "Socio Principal": kickoff.partners && kickoff.partners[0] ? kickoff.partners[0].name : 'Nao Informado',
      "Telefone do Socio": kickoff.partners && kickoff.partners[0] ? kickoff.partners[0].phone : 'Nao Informado',
      "Regime Tributario": kickoff.company.regime || 'Nao Informado',
      "Link do Painel": window.location.origin + window.location.pathname
    };

    const response = await fetch(`https://formsubmit.co/ajax/${EMAIL_NOTIFICATION_CONFIG.toEmail}`, {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log("Notificacao enviada por FormSubmit:", result);
  } catch (error) {
    console.error("Falha ao enviar notificacao por e-mail:", error);
  }
}

// --- AUTO-SALVAMENTO DE RASCUNHO (CLIENTE) ---
function saveFormDraft() {
  if (!checkClientMode()) return; // So salva rascunho em modo cliente

  const draftData = {
    company: {
      razaoSocial: document.getElementById('company-razao-social').value,
      nomeFantasia: document.getElementById('company-nome-fantasia').value,
      cnpj: document.getElementById('company-cnpj').value,
      regime: document.getElementById('company-regime').value,
      telefone: document.getElementById('company-telefone').value,
      email: document.getElementById('company-email').value,
      cep: document.getElementById('address-cep').value,
      logradouro: document.getElementById('address-logradouro').value,
      numero: document.getElementById('address-numero').value,
      complemento: document.getElementById('address-complemento').value,
      bairro: document.getElementById('address-bairro').value,
      cidade: document.getElementById('address-cidade').value,
      uf: document.getElementById('address-uf').value,
      prevAccountingHas: document.querySelector('input[name="prev-accounting-has"]:checked') ? document.querySelector('input[name="prev-accounting-has"]:checked').value : 'Nova',
      prevAccountingName: document.getElementById('prev-accounting-name').value,
      prevAccountingPhone: document.getElementById('prev-accounting-phone').value,
      prevAccountingContact: document.getElementById('prev-accounting-contact').value,
      subestablished: document.querySelector('input[name="company-subestablished"]:checked') ? document.querySelector('input[name="company-subestablished"]:checked').value : 'Não'
    },
    activity: {
      desc: document.getElementById('activity-desc').value,
      cnae: document.getElementById('activity-cnae').value
    },
    employeesQty: document.getElementById('employees-qty').value,
    certificate: {
      has: document.querySelector('input[name="cert-has"]:checked') ? document.querySelector('input[name="cert-has"]:checked').value : 'Não',
      type: document.getElementById('cert-type').value,
      validity: document.getElementById('cert-validity').value
    },
    fiscalPasswords: {
      web: document.getElementById('fiscal-pwd-web').value,
      prodigi: document.getElementById('fiscal-pwd-prodigi').value,
      ginfes: document.getElementById('fiscal-pwd-ginfes').value,
      giss: document.getElementById('fiscal-pwd-giss').value,
      simples: document.getElementById('fiscal-pwd-simples').value,
      state: document.getElementById('fiscal-pwd-state').value,
      others: document.getElementById('fiscal-pwd-others').value
    }
  };

  localStorage.setItem('rbm_kickoff_draft', JSON.stringify(draftData));
}

function loadFormDraft() {
  if (!checkClientMode()) return;
  const raw = localStorage.getItem('rbm_kickoff_draft');
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    if (!draft) return;

    if (draft.company) {
      document.getElementById('company-razao-social').value = draft.company.razaoSocial || '';
      document.getElementById('company-nome-fantasia').value = draft.company.nomeFantasia || '';
      document.getElementById('company-cnpj').value = draft.company.cnpj || '';
      if (draft.company.regime) document.getElementById('company-regime').value = draft.company.regime;
      document.getElementById('company-telefone').value = draft.company.telefone || '';
      document.getElementById('company-email').value = draft.company.email || '';
      document.getElementById('address-cep').value = draft.company.cep || '';
      document.getElementById('address-logradouro').value = draft.company.logradouro || '';
      document.getElementById('address-numero').value = draft.company.numero || '';
      document.getElementById('address-complemento').value = draft.company.complemento || '';
      document.getElementById('address-bairro').value = draft.company.bairro || '';
      document.getElementById('address-cidade').value = draft.company.cidade || '';
      document.getElementById('address-uf').value = draft.company.uf || '';

      if (draft.company.prevAccountingHas) {
        const rad = document.querySelector(`input[name="prev-accounting-has"][value="${draft.company.prevAccountingHas}"]`);
        if (rad) {
          rad.checked = true;
          rad.dispatchEvent(new Event('change'));
        }
      }
      document.getElementById('prev-accounting-name').value = draft.company.prevAccountingName || '';
      document.getElementById('prev-accounting-phone').value = draft.company.prevAccountingPhone || '';
      document.getElementById('prev-accounting-contact').value = draft.company.prevAccountingContact || '';

      if (draft.company.subestablished) {
        const radSub = document.querySelector(`input[name="company-subestablished"][value="${draft.company.subestablished}"]`);
        if (radSub) radSub.checked = true;
      }
    }

    if (draft.activity) {
      document.getElementById('activity-desc').value = draft.activity.desc || '';
      document.getElementById('activity-cnae').value = draft.activity.cnae || '';
    }

    if (draft.employeesQty) {
      document.getElementById('employees-qty').value = draft.employeesQty;
    }

    if (draft.certificate) {
      if (draft.certificate.has) {
        const radCert = document.querySelector(`input[name="cert-has"][value="${draft.certificate.has}"]`);
        if (radCert) {
          radCert.checked = true;
          radCert.dispatchEvent(new Event('change'));
        }
      }
      if (draft.certificate.type) document.getElementById('cert-type').value = draft.certificate.type;
      if (draft.certificate.validity) document.getElementById('cert-validity').value = draft.certificate.validity;
    }

    if (draft.fiscalPasswords) {
      document.getElementById('fiscal-pwd-web').value = draft.fiscalPasswords.web || '';
      document.getElementById('fiscal-pwd-prodigi').value = draft.fiscalPasswords.prodigi || '';
      document.getElementById('fiscal-pwd-ginfes').value = draft.fiscalPasswords.ginfes || '';
      document.getElementById('fiscal-pwd-giss').value = draft.fiscalPasswords.giss || '';
      document.getElementById('fiscal-pwd-simples').value = draft.fiscalPasswords.simples || '';
      document.getElementById('fiscal-pwd-state').value = draft.fiscalPasswords.state || '';
      document.getElementById('fiscal-pwd-others').value = draft.fiscalPasswords.others || '';
    }
  } catch (err) {
    console.error("Erro ao carregar rascunho:", err);
  }
}

function clearFormDraft() {
  localStorage.removeItem('rbm_kickoff_draft');
}

// --- 1. BANCO DE DADOS INDEXEDDB ---
function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      console.error("Erro ao abrir banco de dados:", e.target.error);
      reject(e.target.error);
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Retorna todos os registros mesclando com o Supabase se ativo
async function dbGetAll() {
  const config = getCloudConfig();
  if (config.active && config.url && config.key) {
    try {
      const response = await fetch(`${config.url}/rest/v1/kickoffs?select=id,data,updated_at`, {
        method: 'GET',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`
        }
      });
      if (response.ok) {
        const rows = await response.json();
        const records = rows.map(r => r.data);
        
        // Atualiza o IndexedDB local com os dados atualizados da nuvem
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        for (let rec of records) {
          store.put(rec);
        }
        return records;
      } else {
        console.warn("Falha na resposta do Supabase, usando banco local:", await response.text());
      }
    } catch (e) {
      console.warn("Falha de conexão com Supabase, usando banco local:", e.message);
    }
  }

  // Fallback para o IndexedDB local (Modo Offline)
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Salva localmente (IndexedDB) e sincroniza na nuvem (Supabase) se ativo
async function dbSave(kickoff) {
  // 1. Salva no IndexedDB local primeiro
  await new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(kickoff);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // 2. Sincroniza com o Supabase se ativo
  const config = getCloudConfig();
  if (config.active && config.url && config.key) {
    try {
      const response = await fetch(`${config.url}/rest/v1/kickoffs`, {
        method: 'POST',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates' // Comportamento de UPSERT
        },
        body: JSON.stringify({
          id: kickoff.id,
          data: kickoff,
          updated_at: new Date().toISOString()
        })
      });
      if (!response.ok) {
        console.error("Erro ao sincronizar com o Supabase:", await response.text());
        alert("Ficha salva no seu computador, mas falhou ao sincronizar com a Nuvem. Verifique a conexão.");
      }
    } catch (e) {
      console.error("Erro de conexão ao salvar na nuvem:", e);
      alert("Ficha salva no seu computador (Modo Offline). A sincronização ocorrerá na próxima conexão.");
    }
  }
}

// Exclui localmente e na nuvem se ativo
async function dbDelete(id) {
  await new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  const config = getCloudConfig();
  if (config.active && config.url && config.key) {
    try {
      const response = await fetch(`${config.url}/rest/v1/kickoffs?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': config.key,
          'Authorization': `Bearer ${config.key}`
        }
      });
      if (!response.ok) {
        console.error("Erro ao deletar na nuvem:", await response.text());
      }
    } catch (e) {
      console.error("Erro de conexão ao deletar na nuvem:", e);
    }
  }
}

// --- 2. INICIALIZAÇÃO DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDatabase();
    setupEventListeners();
    
    if (checkClientMode()) {
      applyClientMode();
      resetForm();
      switchTab('formulario');
      loadFormDraft();
    } else {
      await updateCloudStatusUI();
      await seedDemoDataIfEmpty();
      renderDashboard();
      applyAdminRestrictions();
    }
  } catch (error) {
    alert("Falha ao inicializar banco de dados local. " + error.message);
  }
});

// Seed data para demonstração inicial se o banco estiver vazio
async function seedDemoDataIfEmpty() {
  const list = await dbGetAll();
  if (list.length === 0) {
    const demo = {
      id: 'kickoff_' + Date.now() + '_1',
      company: {
        razaoSocial: 'RBM Tecnologias Avançadas Ltda',
        nomeFantasia: 'RBM Tech',
        cnpj: '12.345.678/0001-99',
        regime: 'Simples Nacional',
        telefone: '(11) 98888-5555',
        email: 'contato@rbmtech.com.br',
        cep: '01310-100',
        logradouro: 'Avenida Paulista',
        numero: '1000',
        complemento: 'Sala 152',
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
        proofAddressFile: null,
        proofAddressFileName: '',
        iptuFile: null,
        iptuFileName: '',
        prevAccountingHas: 'Nova',
        prevAccountingName: '',
        prevAccountingPhone: '',
        prevAccountingContact: ''
      },
      activity: {
        desc: 'Prestação de serviços de consultoria em TI e desenvolvimento de software sob encomenda.',
        cnae: '62.01-5-01',
        cnaesFile: null,
        cnaesFileName: ''
      },
      partners: [
        {
          id: 'partner_demo_1',
          name: 'Vivian Ribeiro da Silva',
          cpf: '123.456.789-00',
          rg: '12.345.678-9',
          birthDate: '1990-05-15',
          nacionalidade: 'Brasileira',
          maritalStatus: 'Casado(a)',
          regimeBens: 'Comunhão Parcial de Bens',
          race: 'Parda',
          father: 'Manoel da Silva',
          mother: 'Antonia Ribeiro da Silva',
          phone: '(11) 97777-4444',
          email: 'vivian@rbmtech.com.br',
          isAdmin: true,
          isRfResp: true,
          inssContrib: 'Não',
          inssDetails: '',
          retired: 'Não',
          cep: '01310-100',
          logradouro: 'Avenida Paulista',
          numCompl: '1000, Apto 152',
          bairro: 'Bela Vista',
          cidade: 'São Paulo',
          uf: 'SP',
          photoIdFile: null,
          photoIdFileName: '',
          dependents: [
            {
              name: 'Matheus Ribeiro Silva',
              cpf: '987.654.321-11',
              birthDate: '2016-04-10'
            }
          ]
        }
      ],
      employeesQty: 3,
      certificate: {
        has: 'Sim',
        type: 'A1 (Arquivo)',
        validity: '2027-08-15'
      },
      implantation: {
        date: '2026-07-13',
        user: 'Carlos Alberto (Implantação RBM)',
        signatureName: 'Vivian Ribeiro da Silva'
      }
    };
    await dbSave(demo);
  }
}

// --- 3. CONTROLE DE EVENTOS & ABAS ---
function setupEventListeners() {
  // Seleção de Tipo de Processo (Abertura vs Migração) no Modo Cliente
  document.getElementById('btn-select-abertura').addEventListener('click', () => {
    const welcomeCard = document.getElementById('welcome-selection-card');
    if (welcomeCard) welcomeCard.style.display = 'none';
    const formCard = document.querySelector('.form-card');
    if (formCard) formCard.style.display = 'block';

    const newRadio = document.querySelector('input[name="prev-accounting-has"][value="Nova"]');
    if (newRadio) {
      newRadio.checked = true;
      newRadio.dispatchEvent(new Event('change'));
    }
  });

  document.getElementById('btn-select-migracao').addEventListener('click', () => {
    const welcomeCard = document.getElementById('welcome-selection-card');
    if (welcomeCard) welcomeCard.style.display = 'none';
    const formCard = document.querySelector('.form-card');
    if (formCard) formCard.style.display = 'block';

    const migRadio = document.querySelector('input[name="prev-accounting-has"][value="Migração"]');
    if (migRadio) {
      migRadio.checked = true;
      migRadio.dispatchEvent(new Event('change'));
    }
  });

  // Tabs switching
  document.getElementById('tab-dashboard-btn').addEventListener('click', () => switchTab('dashboard'));
  document.getElementById('tab-formulario-btn').addEventListener('click', () => {
    resetForm();
    switchTab('formulario');
  });

  // Dynamic buttons
  document.getElementById('btn-add-partner').addEventListener('click', () => addPartnerCard());
  document.getElementById('btn-cancel-form').addEventListener('click', () => switchTab('dashboard'));

  // Form submission
  document.getElementById('kickoff-form').addEventListener('submit', handleFormSubmit);

  // Address lookup CEP
  document.getElementById('btn-search-cep').addEventListener('click', searchCEP);
  document.getElementById('address-cep').addEventListener('blur', searchCEP);

  // Search & Filter
  document.getElementById('search-input').addEventListener('input', renderDashboard);
  document.getElementById('filter-regime').addEventListener('change', renderDashboard);

  // Radio button toggles
  document.querySelectorAll('input[name="cert-has"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const certFields = document.querySelectorAll('.cert-fields');
      if (e.target.value === 'Sim') {
        certFields.forEach(f => f.style.display = 'block');
      } else {
        certFields.forEach(f => f.style.display = 'none');
      }
    });
  });

  document.querySelectorAll('input[name="prev-accounting-has"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const fields = document.querySelectorAll('.prev-accounting-fields');
      if (e.target.value === 'Migração') {
        fields.forEach(f => f.style.display = 'block');
      } else {
        fields.forEach(f => f.style.display = 'none');
        document.getElementById('prev-accounting-name').value = '';
        document.getElementById('prev-accounting-phone').value = '';
        document.getElementById('prev-accounting-contact').value = '';
      }
    });
  });

  // File upload change listeners
  document.getElementById('activity-cnaes-file').addEventListener('change', handleFileAttachment);
  document.getElementById('btn-clear-cnaes-file').addEventListener('click', clearAttachedFile);

  document.getElementById('company-proof-address-file').addEventListener('change', handleProofAddressFile);
  document.getElementById('btn-clear-company-proof-address').addEventListener('click', clearProofAddressFile);

  document.getElementById('company-iptu-file').addEventListener('change', handleIptuFile);
  document.getElementById('btn-clear-company-iptu').addEventListener('click', clearIptuFile);

  // DB Backup buttons
  document.getElementById('btn-export-db').addEventListener('click', exportFullDatabase);
  document.getElementById('import-db-file').addEventListener('change', importFullDatabase);

  // Individual Client JSON import from dashboard
  document.getElementById('import-file').addEventListener('change', importSingleClientJSON);

  // Cloud settings modal triggers
  document.getElementById('btn-cloud-settings').addEventListener('click', openCloudModal);
  document.getElementById('btn-close-cloud-modal').addEventListener('click', closeCloudModal);
  document.getElementById('btn-save-cloud-settings').addEventListener('click', saveCloudSettings);

  // Admin access triggers
  document.getElementById('btn-admin-toggle').addEventListener('click', handleAdminToggle);
  document.getElementById('btn-close-admin-modal').addEventListener('click', closeAdminModal);
  document.getElementById('btn-login-admin').addEventListener('click', executeAdminLogin);
  document.getElementById('admin-password-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeAdminLogin();
  });

  // View Modal close triggers
  document.getElementById('btn-close-view-modal').addEventListener('click', closeViewModal);
  document.getElementById('btn-close-view-modal-bottom').addEventListener('click', closeViewModal);

  // Auto-salvamento de rascunhos para o cliente
  const kickoffForm = document.getElementById('kickoff-form');
  if (kickoffForm) {
    kickoffForm.addEventListener('input', saveFormDraft);
    kickoffForm.addEventListener('change', saveFormDraft);
  }

  // Input masks binding
  bindMasks();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  if (tabId === 'dashboard') {
    document.getElementById('tab-dashboard-btn').classList.add('active');
    document.getElementById('tab-dashboard').classList.add('active');
    renderDashboard();
  } else {
    document.getElementById('tab-formulario-btn').classList.add('active');
    document.getElementById('tab-formulario').classList.add('active');

    const isClient = checkClientMode();
    const welcomeCard = document.getElementById('welcome-selection-card');
    const formCard = document.querySelector('.form-card');
    const successScreen = document.getElementById('success-screen');

    if (isClient) {
      if (successScreen && successScreen.style.display !== 'flex') {
        if (welcomeCard) welcomeCard.style.display = 'flex';
        if (formCard) formCard.style.display = 'none';
      }
    } else {
      if (welcomeCard) welcomeCard.style.display = 'none';
      if (formCard) formCard.style.display = 'block';
      if (successScreen) successScreen.style.display = 'none';
    }
  }
}

// --- 4. FORMATADORES E MÁSCARAS ---
function bindMasks() {
  // CNPJ Mask
  maskField(document.getElementById('company-cnpj'), '00.000.000/0000-00');
  // CEP Mask
  maskField(document.getElementById('address-cep'), '00000-000');
  // Phone Mask
  maskField(document.getElementById('company-telefone'), (val) => {
    return val.replace(/\D/g, '').length <= 10 ? '(00) 0000-0000' : '(00) 00000-0000';
  });
  // Previous Accountant Phone Mask
  maskField(document.getElementById('prev-accounting-phone'), (val) => {
    return val.replace(/\D/g, '').length <= 10 ? '(00) 0000-0000' : '(00) 00000-0000';
  });
}

function maskField(input, pattern) {
  if (!input) return;
  input.addEventListener('input', () => {
    let value = input.value.replace(/\D/g, '');
    let actualPattern = typeof pattern === 'function' ? pattern(input.value) : pattern;
    let formatted = '';
    let valIdx = 0;

    for (let i = 0; i < actualPattern.length && valIdx < value.length; i++) {
      if (actualPattern[i] === '0') {
        formatted += value[valIdx++];
      } else {
        formatted += actualPattern[i];
      }
    }
    input.value = formatted;
  });
}

// Formatar string de CPF
function formatCPF(val) {
  let v = val.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

// Formatar string de Telefone
function formatPhone(val) {
  let v = val.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);
  if (v.length <= 10) {
    return v.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  } else {
    return v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
}

// --- 5. BUSCA DE CEP (ViaCEP API) ---
async function searchCEP() {
  const cepField = document.getElementById('address-cep');
  const cep = cepField.value.replace(/\D/g, '');

  if (cep.length !== 8) return;

  const btn = document.getElementById('btn-search-cep');
  const originalText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();

    if (data.erro) {
      alert("CEP não encontrado.");
      return;
    }

    document.getElementById('address-logradouro').value = data.logradouro || '';
    document.getElementById('address-bairro').value = data.bairro || '';
    document.getElementById('address-cidade').value = data.localidade || '';
    document.getElementById('address-uf').value = data.uf || '';

    // Foca no número
    document.getElementById('address-numero').focus();
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// --- 6. CÁLCULO DE IDADE ---
function calculateAge(birthDateString) {
  if (!birthDateString) return '';
  const today = new Date();
  const birthDate = new Date(birthDateString);
  
  // Resolve offset de fuso horário local
  const utcBirthDate = new Date(birthDate.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate());
  
  let age = today.getFullYear() - utcBirthDate.getFullYear();
  const m = today.getMonth() - utcBirthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < utcBirthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
}

// --- COMPRESSÃO DE IMAGENS ---
function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// --- 7. ARQUIVOS ANEXOS (CNAEs) ---
let attachedFileBase64 = null;
let attachedFileName = '';

function handleFileAttachment(e) {
  const file = e.target.files[0];
  if (!file) return;

  compressImage(file).then(processedFile => {
    const isImg = processedFile.type.startsWith('image/');
    const limit = isImg ? 3 * 1024 * 1024 : 10 * 1024 * 1024;
    const limitName = isImg ? "3MB (comprimido)" : "10MB";

    if (processedFile.size > limit) {
      alert(`O arquivo é muito grande. O tamanho máximo permitido é de ${limitName}.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      attachedFileBase64 = event.target.result;
      attachedFileName = processedFile.name;
      document.getElementById('cnaes-file-status').textContent = `Anexado: ${processedFile.name}`;
      document.getElementById('btn-clear-cnaes-file').style.display = 'inline-block';
      
      const dlBtn = document.getElementById('btn-download-cnaes-file');
      dlBtn.href = attachedFileBase64;
      dlBtn.download = attachedFileName;
      dlBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(processedFile);
  });
}

function clearAttachedFile() {
  attachedFileBase64 = null;
  attachedFileName = '';
  document.getElementById('activity-cnaes-file').value = '';
  document.getElementById('cnaes-file-status').textContent = 'Nenhum arquivo anexado';
  document.getElementById('btn-clear-cnaes-file').style.display = 'none';
  document.getElementById('btn-download-cnaes-file').style.display = 'none';
}

// --- 7.1. COMPROVANTE DE ENDEREÇO DA EMPRESA ---
let attachedProofAddressBase64 = null;
let attachedProofAddressName = '';

function handleProofAddressFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  compressImage(file).then(processedFile => {
    const isImg = processedFile.type.startsWith('image/');
    const limit = isImg ? 3 * 1024 * 1024 : 10 * 1024 * 1024;
    const limitName = isImg ? "3MB (comprimido)" : "10MB";

    if (processedFile.size > limit) {
      alert(`O arquivo é muito grande. O tamanho máximo permitido é de ${limitName}.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      attachedProofAddressBase64 = event.target.result;
      attachedProofAddressName = processedFile.name;
      document.getElementById('company-proof-address-file-status').textContent = `Anexado: ${processedFile.name}`;
      document.getElementById('btn-clear-company-proof-address').style.display = 'inline-block';
      
      const dlBtn = document.getElementById('btn-download-company-proof-address');
      dlBtn.href = attachedProofAddressBase64;
      dlBtn.download = attachedProofAddressName;
      dlBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(processedFile);
  });
}

function clearProofAddressFile() {
  attachedProofAddressBase64 = null;
  attachedProofAddressName = '';
  document.getElementById('company-proof-address-file').value = '';
  document.getElementById('company-proof-address-file-status').textContent = 'Nenhum arquivo anexado';
  document.getElementById('btn-clear-company-proof-address').style.display = 'none';
  document.getElementById('btn-download-company-proof-address').style.display = 'none';
}

// --- 7.2. IPTU DO IMÓVEL ---
let attachedIptuBase64 = null;
let attachedIptuName = '';

function handleIptuFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  compressImage(file).then(processedFile => {
    const isImg = processedFile.type.startsWith('image/');
    const limit = isImg ? 3 * 1024 * 1024 : 10 * 1024 * 1024;
    const limitName = isImg ? "3MB (comprimido)" : "10MB";

    if (processedFile.size > limit) {
      alert(`O arquivo é muito grande. O tamanho máximo permitido é de ${limitName}.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
      attachedIptuBase64 = event.target.result;
      attachedIptuName = processedFile.name;
      document.getElementById('company-iptu-file-status').textContent = `Anexado: ${processedFile.name}`;
      document.getElementById('btn-clear-company-iptu').style.display = 'inline-block';
      
      const dlBtn = document.getElementById('btn-download-company-iptu');
      dlBtn.href = attachedIptuBase64;
      dlBtn.download = attachedIptuName;
      dlBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(processedFile);
  });
}

function clearIptuFile() {
  attachedIptuBase64 = null;
  attachedIptuName = '';
  document.getElementById('company-iptu-file').value = '';
  document.getElementById('company-iptu-file-status').textContent = 'Nenhum arquivo anexado';
  document.getElementById('btn-clear-company-iptu').style.display = 'none';
  document.getElementById('btn-download-company-iptu').style.display = 'none';
}

// --- 8. SÓCIOS DINÂMICOS ---
function addPartnerCard(partnerData = null) {
  const container = document.getElementById('partners-container');
  const partnerId = partnerData ? partnerData.id : 'partner_' + Date.now() + '_' + (++partnerIdCounter);

  const card = document.createElement('div');
  card.className = 'partner-card';
  card.id = partnerId;

  card.innerHTML = `
    <div class="partner-card-header">
      <span class="partner-title">Dados do Sócio</span>
      <button type="button" class="btn-remove-partner" onclick="removePartnerCard('${partnerId}')">Excluir Sócio</button>
    </div>
    
    <div class="grid-3">
      <div class="form-group">
        <label>Nome do Sócio</label>
        <input type="text" class="partner-name" placeholder="Nome Completo">
      </div>
      <div class="form-group">
        <label>CPF</label>
        <input type="text" class="partner-cpf" placeholder="000.000.000-00">
      </div>
      <div class="form-group">
        <label>RG</label>
        <input type="text" class="partner-rg" placeholder="Nº do RG">
      </div>
      <div class="form-group">
        <label>Data de Nascimento</label>
        <input type="date" class="partner-birth">
      </div>
      <div class="form-group">
        <label>Nacionalidade</label>
        <input type="text" class="partner-nacionalidade" placeholder="Ex: Brasileira" value="Brasileira">
      </div>
      <div class="form-group">
        <label>Estado Civil</label>
        <select class="partner-marital">
          <option value="" disabled selected>Selecione...</option>
          <option value="Solteiro(a)">Solteiro(a)</option>
          <option value="Casado(a)">Casado(a)</option>
          <option value="Divorciado(a)">Divorciado(a)</option>
          <option value="Viúvo(a)">Viúvo(a)</option>
          <option value="União Estável">União Estável</option>
        </select>
      </div>
      <div class="form-group partner-marriage-regime-group" style="display:none;">
        <label>Regime de Bens</label>
        <select class="partner-regime-bens">
          <option value="" disabled selected>Selecione...</option>
          <option value="Comunhão Parcial de Bens">Comunhão Parcial de Bens</option>
          <option value="Comunhão Universal de Bens">Comunhão Universal de Bens</option>
          <option value="Separação Total de Bens">Separação Total de Bens</option>
          <option value="Participação Final nos Aquestos">Participação Final nos Aquestos</option>
        </select>
      </div>
      <div class="form-group">
        <label>Cor/Raça</label>
        <select class="partner-race">
          <option value="" disabled selected>Selecione...</option>
          <option value="Branca">Branca</option>
          <option value="Preta">Preta</option>
          <option value="Parda">Parda</option>
          <option value="Amarela">Amarela</option>
          <option value="Indígena">Indígena</option>
          <option value="Não Informado">Não Informado</option>
        </select>
      </div>
      <div class="form-group">
        <label>Nome do Pai</label>
        <input type="text" class="partner-father" placeholder="Nome completo do pai">
      </div>
      <div class="form-group">
        <label>Nome da Mãe</label>
        <input type="text" class="partner-mother" placeholder="Nome completo da mãe">
      </div>
      <div class="form-group">
        <label>Telefone</label>
        <input type="text" class="partner-phone" placeholder="(00) 00000-0000">
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input type="email" class="partner-email" placeholder="socio@empresa.com.br">
      </div>
      <div class="form-group">
        <label>Grau de Escolaridade</label>
        <select class="partner-education">
          <option value="" disabled selected>Selecione...</option>
          <option value="Ensino Fundamental Incompleto">Ensino Fundamental Incompleto</option>
          <option value="Ensino Fundamental Completo">Ensino Fundamental Completo</option>
          <option value="Ensino Médio Incompleto">Ensino Médio Incompleto</option>
          <option value="Ensino Médio Completo">Ensino Médio Completo</option>
          <option value="Ensino Superior Incompleto">Ensino Superior Incompleto</option>
          <option value="Ensino Superior Completo">Ensino Superior Completo</option>
          <option value="Pós-graduação / Especialização">Pós-graduação / Especialização</option>
          <option value="Mestrado / Doutorado">Mestrado / Doutorado</option>
          <option value="Não Informado">Não Informado</option>
        </select>
      </div>
    </div>

    <!-- Informações Previdenciárias do Sócio -->
    <div style="margin-top: 1.25rem; border-top: 1px dashed var(--border); padding-top: 1rem;">
      <h5 style="font-size:0.8rem; font-weight:700; color:var(--primary-light); margin-bottom:0.75rem; text-transform:uppercase; border-left:3px solid var(--accent); padding-left:6px;">Informações Previdenciárias & Pró-labore</h5>
      <div class="grid-3">
        <div class="form-group">
          <label>Contribui com INSS em outra empresa?</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="partner-inss-contrib-${partnerId}" value="Sim" class="partner-inss-contrib-yes">
              <span>Sim</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="partner-inss-contrib-${partnerId}" value="Não" checked class="partner-inss-contrib-no">
              <span>Não</span>
            </label>
          </div>
        </div>
        <div class="form-group partner-inss-details-group" style="display:none; grid-column: span 2;">
          <label>Se sim, descreva a contribuição (Empresa e valor)</label>
          <input type="text" class="partner-inss-details" placeholder="Ex: Contribui no teto pela empresa XYZ">
        </div>
        <div class="form-group">
          <label>É Aposentado?</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="partner-retired-${partnerId}" value="Sim" class="partner-retired-yes">
              <span>Sim</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="partner-retired-${partnerId}" value="Não" checked class="partner-retired-no">
              <span>Não</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Terá retirada de Pró-labore?</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="partner-prolabore-has-${partnerId}" value="Sim" class="partner-prolabore-yes">
              <span>Sim</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="partner-prolabore-has-${partnerId}" value="Não" checked class="partner-prolabore-no">
              <span>Não</span>
            </label>
          </div>
        </div>
        <div class="form-group partner-prolabore-val-group" style="display:none; grid-column: span 2;">
          <label>Qual o valor da retirada mensal (Pró-labore)?</label>
          <input type="text" class="partner-prolabore-val" placeholder="Mínimo 1 salário mínimo (R$ 1.412,00 ou valor vigente)">
        </div>
        <div class="form-group full-width" style="grid-column: span 3; background-color: #f8fafc; border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; margin-top: 5px;">
          <small style="color: var(--text-muted); font-size: 0.8rem; line-height: 1.45;">
            💡 <strong>Nota sobre Pró-labore:</strong> A retirada não é obrigatória. Contudo, quando há retirada, é obrigatório pagar 11% de INSS sobre o valor escolhido. A RBM Contabilidade sempre orienta e recomenda realizar a retirada mínima para fins de direitos previdenciários (afastamentos por doença, licença maternidade e aposentadoria).
          </small>
        </div>
      </div>
    </div>

    <!-- Endereço Residencial do Sócio -->
    <div style="margin-top: 1.25rem; border-top: 1px dashed var(--border); padding-top: 1rem;">
      <h5 style="font-size:0.8rem; font-weight:700; color:var(--primary-light); margin-bottom:0.75rem; text-transform:uppercase; border-left:3px solid var(--accent); padding-left:6px;">Endereço Residencial</h5>
      <div class="grid-4">
        <div class="form-group">
          <label>CEP Residencial</label>
          <div class="cep-input-group">
            <input type="text" class="partner-cep" placeholder="00000-000">
            <button type="button" class="btn btn-outline btn-sm btn-partner-cep-search">Buscar</button>
          </div>
        </div>
        <div class="form-group full-width-2">
          <label>Logradouro Residencial</label>
          <input type="text" class="partner-logradouro" placeholder="Rua, Avenida, etc.">
        </div>
        <div class="form-group">
          <label>Número e Compl.</label>
          <input type="text" class="partner-num-compl" placeholder="Ex: 123, apto 45">
        </div>
        <div class="form-group">
          <label>Bairro</label>
          <input type="text" class="partner-bairro">
        </div>
        <div class="form-group full-width-2">
          <label>Cidade</label>
          <input type="text" class="partner-cidade">
        </div>
        <div class="form-group">
          <label>UF</label>
          <input type="text" class="partner-uf" maxlength="2" style="text-transform: uppercase;">
        </div>
      </div>
    </div>

    <!-- Anexo de Documentos do Sócio (Múltiplos) -->
    <div style="margin-top: 1.25rem; border-top: 1px dashed var(--border); padding-top: 1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <h5 style="font-size:0.8rem; font-weight:700; color:var(--primary-light); text-transform:uppercase; border-left:3px solid var(--accent); padding-left:6px; margin:0;">Documentos do Sócio (CNH, RG, CPF, etc.)</h5>
        <button type="button" class="btn btn-outline btn-sm btn-partner-add-doc" style="font-size:0.75rem; padding:2px 8px;">+ Adicionar Documento</button>
      </div>
      <div class="partner-docs-container" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px;">
        <!-- Elementos de upload dinâmicos -->
      </div>
    </div>


    <!-- Dependentes do Sócio para IR -->
    <div style="margin-top: 1.25rem; border-top: 1px dashed var(--border); padding-top: 1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <h5 style="font-size:0.8rem; font-weight:700; color:var(--primary-light); text-transform:uppercase; border-left:3px solid var(--accent); padding-left:6px; margin:0;">Dependentes para IR</h5>
        <button type="button" class="btn btn-outline btn-sm btn-partner-add-dep">+ Adicionar Dependente</button>
      </div>
      <div class="table-responsive">
        <table class="form-table">
          <thead>
            <tr>
              <th style="width:35%;">Nome do Dependente</th>
              <th style="width:25%;">CPF</th>
              <th style="width:25%;">Data de Nascimento</th>
              <th style="width:10%;">Idade</th>
              <th style="width:5%; text-align:center;">Remover</th>
            </tr>
          </thead>
          <tbody class="partner-deps-body"></tbody>
        </table>
      </div>
      <div class="partner-deps-empty" style="text-align:center; padding:1rem; color:var(--text-muted); font-size:0.8rem; border:1px dashed var(--border); border-top:none;">
        Nenhum dependente cadastrado para este sócio.
      </div>
    </div>
    
    <div class="grid-2" style="margin-top: 1.25rem; border-top: 1px solid var(--border); padding-top: 0.75rem;">
      <div class="form-group">
        <label class="checkbox-label" style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
          <input type="checkbox" class="partner-is-admin">
          <span>Sócio administrador? (Assina pela empresa)</span>
        </label>
      </div>
      <div class="form-group">
        <label class="checkbox-label" style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
          <input type="checkbox" class="partner-is-rf-resp">
          <span>Responsável legal perante a Receita Federal?</span>
        </label>
      </div>
    </div>
  `;

  container.appendChild(card);

  // Bind masks for new cards
  const cpfInput = card.querySelector('.partner-cpf');
  maskField(cpfInput, '000.000.000-00');

  const phoneInput = card.querySelector('.partner-phone');
  maskField(phoneInput, (val) => {
    return val.replace(/\D/g, '').length <= 10 ? '(00) 0000-0000' : '(00) 00000-0000';
  });

  const cepInput = card.querySelector('.partner-cep');
  maskField(cepInput, '00000-000');

  // Bind marital status change to show/hide Regime de Bens
  const maritalSelect = card.querySelector('.partner-marital');
  const regimeGroup = card.querySelector('.partner-marriage-regime-group');
  const regimeSelect = card.querySelector('.partner-regime-bens');
  
  maritalSelect.addEventListener('change', (e) => {
    if (e.target.value === 'Casado(a)' || e.target.value === 'União Estável') {
      regimeGroup.style.display = 'block';
    } else {
      regimeGroup.style.display = 'none';
      regimeSelect.value = '';
    }
  });

  // Bind CEP search for partners
  const cepBtn = card.querySelector('.btn-partner-cep-search');
  const searchPartnerCEP = async () => {
    const cep = cepInput.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    
    cepBtn.disabled = true;
    const origText = cepBtn.textContent;
    cepBtn.textContent = '...';
    
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data.erro) {
        card.querySelector('.partner-logradouro').value = data.logradouro || '';
        card.querySelector('.partner-bairro').value = data.bairro || '';
        card.querySelector('.partner-cidade').value = data.localidade || '';
        card.querySelector('.partner-uf').value = data.uf || '';
        card.querySelector('.partner-num-compl').focus();
      } else {
        alert("CEP não encontrado.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      cepBtn.disabled = false;
      cepBtn.textContent = origText;
    }
  };
  cepBtn.addEventListener('click', searchPartnerCEP);
  cepInput.addEventListener('blur', searchPartnerCEP);

  // Bind INSS details radio
  const inssYes = card.querySelector('.partner-inss-contrib-yes');
  const inssNo = card.querySelector('.partner-inss-contrib-no');
  const inssDetailsGroup = card.querySelector('.partner-inss-details-group');
  
  inssYes.addEventListener('change', () => {
    inssDetailsGroup.style.display = 'block';
  });
  inssNo.addEventListener('change', () => {
    inssDetailsGroup.style.display = 'none';
    card.querySelector('.partner-inss-details').value = '';
  });

  // Bind Pró-labore details radio
  const prolaboreYes = card.querySelector('.partner-prolabore-yes');
  const prolaboreNo = card.querySelector('.partner-prolabore-no');
  const prolaboreValGroup = card.querySelector('.partner-prolabore-val-group');
  const prolaboreValInput = card.querySelector('.partner-prolabore-val');

  prolaboreYes.addEventListener('change', () => {
    prolaboreValGroup.style.display = 'block';
  });
  prolaboreNo.addEventListener('change', () => {
    prolaboreValGroup.style.display = 'none';
    prolaboreValInput.value = '';
  });

  // Configuração de Múltiplos Documentos do Sócio
  const docContainer = card.querySelector('.partner-docs-container');
  const addDocBtn = card.querySelector('.btn-partner-add-doc');

  const addPartnerDocRow = (docData = null) => {
    const docDiv = document.createElement('div');
    docDiv.className = 'partner-doc-item';
    docDiv.style = 'border: 1px solid var(--border); padding: 8px; border-radius: 6px; background: #fafafa; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.8rem;';
    
    docDiv.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:4px; flex-grow:1; overflow:hidden;">
        <input type="file" class="partner-doc-file" accept="image/*,application/pdf" style="font-size:0.75rem; width:100%;">
        <span class="partner-doc-status" style="font-size:0.75rem; color:var(--text-muted); max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Nenhum arquivo anexado</span>
      </div>
      <div style="display:flex; gap:4px; flex-shrink:0;">
        <a href="#" class="btn btn-accent btn-xs btn-download-partner-doc" style="display:none; padding:2px 6px; font-size:0.7rem;" target="_blank">Baixar</a>
        <button type="button" class="btn btn-outline btn-xs btn-remove-partner-doc" style="color:var(--danger); border-color:var(--danger); padding:2px 6px; font-size:0.7rem;">&times;</button>
      </div>
    `;
    
    let docBase64 = docData ? docData.file : null;
    let docName = docData ? docData.name : '';
    
    docDiv.photoFile = docBase64;
    docDiv.photoName = docName;
    
    const fileInput = docDiv.querySelector('.partner-doc-file');
    const statusSpan = docDiv.querySelector('.partner-doc-status');
    const downloadBtn = docDiv.querySelector('.btn-download-partner-doc');
    const removeBtn = docDiv.querySelector('.btn-remove-partner-doc');
    
    const updateUI = () => {
      if (docBase64) {
        statusSpan.textContent = docName;
        fileInput.style.display = 'none';
        downloadBtn.href = docBase64;
        downloadBtn.download = docName;
        downloadBtn.style.display = 'inline-block';
      } else {
        statusSpan.textContent = 'Nenhum arquivo anexado';
        fileInput.style.display = 'block';
        downloadBtn.style.display = 'none';
      }
    };
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      compressImage(file).then(processedFile => {
        const isImg = processedFile.type.startsWith('image/');
        const limit = isImg ? 3 * 1024 * 1024 : 10 * 1024 * 1024;
        const limitName = isImg ? "3MB (comprimido)" : "10MB";

        if (processedFile.size > limit) {
          alert(`O arquivo é muito grande. Tamanho máximo permitido: ${limitName}.`);
          fileInput.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          docBase64 = event.target.result;
          docName = processedFile.name;
          docDiv.photoFile = docBase64;
          docDiv.photoName = docName;
          updateUI();
        };
        reader.readAsDataURL(processedFile);
      });
    });
    
    removeBtn.addEventListener('click', () => {
      docDiv.remove();
    });
    
    docContainer.appendChild(docDiv);
    updateUI();
  };

  addDocBtn.addEventListener('click', () => addPartnerDocRow());

  // Dependents Table inside card logic
  const depsBody = card.querySelector('.partner-deps-body');
  const depsEmpty = card.querySelector('.partner-deps-empty');
  const addDepBtn = card.querySelector('.btn-partner-add-dep');
  
  const addPartnerDependentRow = (depData = null) => {
    depsEmpty.style.display = 'none';
    const tr = document.createElement('tr');
    const rowId = 'dep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
    tr.id = rowId;
    
    tr.innerHTML = `
      <td>
        <input type="text" class="dep-name" placeholder="Nome completo" style="width:100%; padding:4px 8px; border:1px solid var(--border); border-radius:4px;">
      </td>
      <td>
        <input type="text" class="dep-cpf" placeholder="000.000.000-00" style="width:100%; padding:4px 8px; border:1px solid var(--border); border-radius:4px;">
      </td>
      <td>
        <input type="date" class="dep-birth" style="width:100%; padding:4px 8px; border:1px solid var(--border); border-radius:4px;">
      </td>
      <td class="dep-age-display" style="font-weight:600; text-align:center; color:var(--primary); font-size: 0.85rem;">
        -
      </td>
      <td style="text-align:center;">
        <button type="button" class="btn-remove-row" style="color:var(--danger); background:none; border:none; font-size:1.20rem; cursor:pointer;">&times;</button>
      </td>
    `;
    
    depsBody.appendChild(tr);
    
    const cpfInput = tr.querySelector('.dep-cpf');
    maskField(cpfInput, '000.000.000-00');
    
    const birthInput = tr.querySelector('.dep-birth');
    const ageDisplay = tr.querySelector('.dep-age-display');
    
    birthInput.addEventListener('change', () => {
      const age = calculateAge(birthInput.value);
      ageDisplay.textContent = age !== '' ? age : '-';
    });
    
    tr.querySelector('.btn-remove-row').addEventListener('click', () => {
      tr.remove();
      if (depsBody.children.length === 0) {
        depsEmpty.style.display = 'block';
      }
    });
    
    if (depData) {
      tr.querySelector('.dep-name').value = depData.name || '';
      tr.querySelector('.dep-cpf').value = depData.cpf || '';
      tr.querySelector('.dep-birth').value = depData.birthDate || '';
      ageDisplay.textContent = calculateAge(depData.birthDate);
    }
  };
  
  addDepBtn.addEventListener('click', () => addPartnerDependentRow());

  // Populate data if editing
  if (partnerData) {
    card.querySelector('.partner-name').value = partnerData.name || '';
    card.querySelector('.partner-cpf').value = partnerData.cpf || '';
    card.querySelector('.partner-rg').value = partnerData.rg || '';
    card.querySelector('.partner-birth').value = partnerData.birthDate || '';
    card.querySelector('.partner-nacionalidade').value = partnerData.nacionalidade || 'Brasileira';
    card.querySelector('.partner-marital').value = partnerData.maritalStatus || '';
    card.querySelector('.partner-race').value = partnerData.race || '';
    card.querySelector('.partner-father').value = partnerData.father || '';
    card.querySelector('.partner-mother').value = partnerData.mother || '';
    card.querySelector('.partner-phone').value = partnerData.phone || '';
    card.querySelector('.partner-email').value = partnerData.email || '';
    
    card.querySelector('.partner-is-admin').checked = !!partnerData.isAdmin;
    card.querySelector('.partner-is-rf-resp').checked = !!partnerData.isRfResp;

    // INSS
    if (partnerData.inssContrib === 'Sim') {
      card.querySelector('.partner-inss-contrib-yes').checked = true;
      inssDetailsGroup.style.display = 'block';
      card.querySelector('.partner-inss-details').value = partnerData.inssDetails || '';
    } else {
      card.querySelector('.partner-inss-contrib-no').checked = true;
    }

    // Aposentado
    if (partnerData.retired === 'Sim') {
      card.querySelector('.partner-retired-yes').checked = true;
    } else {
      card.querySelector('.partner-retired-no').checked = true;
    }

    // Pro-labore
    if (partnerData.prolaboreHas === 'Sim') {
      card.querySelector('.partner-prolabore-yes').checked = true;
      prolaboreValGroup.style.display = 'block';
      card.querySelector('.partner-prolabore-val').value = partnerData.prolaboreVal || '';
    } else {
      card.querySelector('.partner-prolabore-no').checked = true;
    }

    // Regime de bens
    if (partnerData.maritalStatus === 'Casado(a)' || partnerData.maritalStatus === 'União Estável') {
      regimeGroup.style.display = 'block';
      card.querySelector('.partner-regime-bens').value = partnerData.regimeBens || '';
    }

    // Endereço Residencial
    card.querySelector('.partner-cep').value = partnerData.cep || '';
    card.querySelector('.partner-logradouro').value = partnerData.logradouro || '';
    card.querySelector('.partner-num-compl').value = partnerData.numCompl || '';
    card.querySelector('.partner-bairro').value = partnerData.bairro || '';
    card.querySelector('.partner-cidade').value = partnerData.cidade || '';
    card.querySelector('.partner-uf').value = partnerData.uf || '';

    // Grau de Escolaridade
    card.querySelector('.partner-education').value = partnerData.educationLevel || '';

    // Dependentes
    if (partnerData.dependents && partnerData.dependents.length > 0) {
      partnerData.dependents.forEach(dep => addPartnerDependentRow(dep));
    }

    // Documentos
    if (partnerData.photoIdFiles && Array.isArray(partnerData.photoIdFiles)) {
      partnerData.photoIdFiles.forEach(doc => addPartnerDocRow(doc));
    } else if (partnerData.photoIdFile) {
      addPartnerDocRow({
        file: partnerData.photoIdFile,
        name: partnerData.photoIdFileName || 'documento.png'
      });
    } else {
      addPartnerDocRow();
    }
  } else {
    // Para novos sócios, adiciona um slot de documento por padrão
    addPartnerDocRow();
  }
}

window.removePartnerCard = function(partnerId) {
  const card = document.getElementById(partnerId);
  if (card) card.remove();
};

// --- 9. LIMPAR E REORGANIZAR FORMULÁRIO ---
function resetForm() {
  document.getElementById('kickoff-form').reset();
  document.getElementById('edit-client-id').value = '';
  document.getElementById('form-action-title').textContent = 'Novo Kick-off de Entrada';

  // Limpa containers
  document.getElementById('partners-container').innerHTML = '';

  // Reseta anexos da empresa
  clearAttachedFile();
  clearProofAddressFile();
  clearIptuFile();

  // Reseta contabilidade anterior
  document.querySelectorAll('.prev-accounting-fields').forEach(f => f.style.display = 'none');

  // Reseta subestabelecimento
  const subestNoRadio = document.getElementById('company-subestablished-no');
  if (subestNoRadio) subestNoRadio.checked = true;

  // Ocultar campos opcionais gerais
  document.querySelectorAll('.cert-fields').forEach(f => f.style.display = 'none');

  // Define data atual no kick-off por padrão (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('kickoff-date').value = today;

  // Adiciona um sócio em branco por padrão
  addPartnerCard();
}

// --- 10. SUBMISSÃO DE FORMULÁRIO (SALVAMENTO) ---
async function handleFormSubmit(e) {
  e.preventDefault();

  // Coleta dados dos sócios
  const partners = [];
  const partnerCards = document.querySelectorAll('.partner-card');
  
  if (partnerCards.length === 0) {
    alert("Adicione pelo menos um sócio para prosseguir.");
    return;
  }

  for (let card of partnerCards) {
    // Coleta dependentes deste sócio
    const partnerDeps = [];
    const depRows = card.querySelectorAll('.partner-deps-body tr');
    for (let row of depRows) {
      partnerDeps.push({
        name: row.querySelector('.dep-name').value,
        cpf: row.querySelector('.dep-cpf').value,
        birthDate: row.querySelector('.dep-birth').value
      });
    }

    const inssVal = card.querySelector('.partner-inss-contrib-yes').checked ? 'Sim' : 'Não';
    const retiredVal = card.querySelector('.partner-retired-yes').checked ? 'Sim' : 'Não';
    const inssDet = inssVal === 'Sim' ? card.querySelector('.partner-inss-details').value : '';
    const prolaboreVal = card.querySelector('.partner-prolabore-yes').checked ? 'Sim' : 'Não';
    const prolaboreAmount = prolaboreVal === 'Sim' ? card.querySelector('.partner-prolabore-val').value : '';

    partners.push({
      id: card.id,
      name: card.querySelector('.partner-name').value,
      cpf: card.querySelector('.partner-cpf').value,
      rg: card.querySelector('.partner-rg').value,
      birthDate: card.querySelector('.partner-birth').value,
      nacionalidade: card.querySelector('.partner-nacionalidade').value,
      maritalStatus: card.querySelector('.partner-marital').value,
      race: card.querySelector('.partner-race').value,
      father: card.querySelector('.partner-father').value,
      mother: card.querySelector('.partner-mother').value,
      phone: card.querySelector('.partner-phone').value,
      email: card.querySelector('.partner-email').value,
      educationLevel: card.querySelector('.partner-education').value,
      isAdmin: card.querySelector('.partner-is-admin').checked,
      isRfResp: card.querySelector('.partner-is-rf-resp').checked,
      regimeBens: card.querySelector('.partner-regime-bens').value,
      cep: card.querySelector('.partner-cep').value,
      logradouro: card.querySelector('.partner-logradouro').value,
      numCompl: card.querySelector('.partner-num-compl').value,
      bairro: card.querySelector('.partner-bairro').value,
      cidade: card.querySelector('.partner-cidade').value,
      uf: card.querySelector('.partner-uf').value,
      inssContrib: inssVal,
      inssDetails: inssDet,
      retired: retiredVal,
      prolaboreHas: prolaboreVal,
      prolaboreVal: prolaboreAmount,
       photoIdFiles: Array.from(card.querySelectorAll('.partner-doc-item')).map(div => ({
        file: div.photoFile,
        name: div.photoName
      })).filter(doc => doc.file),
      photoIdFile: Array.from(card.querySelectorAll('.partner-doc-item')).map(div => div.photoFile).filter(Boolean)[0] || null,
      photoIdFileName: Array.from(card.querySelectorAll('.partner-doc-item')).map(div => div.photoName).filter(Boolean)[0] || '',
      dependents: partnerDeps
    });
  }

  // Validação rápida do certificado
  const certHas = document.querySelector('input[name="cert-has"]:checked').value;
  const certType = certHas === 'Sim' ? document.getElementById('cert-type').value : '';
  const certValidity = certHas === 'Sim' ? document.getElementById('cert-validity').value : '';

  // Identificador único
  let id = document.getElementById('edit-client-id').value;
  if (!id) {
    id = 'kickoff_' + Date.now();
  }

  const kickoffData = {
    id: id,
    company: {
      razaoSocial: document.getElementById('company-razao-social').value,
      nomeFantasia: document.getElementById('company-nome-fantasia').value,
      cnpj: document.getElementById('company-cnpj').value,
      regime: document.getElementById('company-regime').value,
      telefone: document.getElementById('company-telefone').value,
      email: document.getElementById('company-email').value,
      cep: document.getElementById('address-cep').value,
      logradouro: document.getElementById('address-logradouro').value,
      numero: document.getElementById('address-numero').value,
      complemento: document.getElementById('address-complemento').value,
      bairro: document.getElementById('address-bairro').value,
      cidade: document.getElementById('address-cidade').value,
      uf: document.getElementById('address-uf').value,
      proofAddressFile: attachedProofAddressBase64,
      proofAddressFileName: attachedProofAddressName,
      iptuFile: attachedIptuBase64,
      iptuFileName: attachedIptuName,
      prevAccountingHas: document.querySelector('input[name="prev-accounting-has"]:checked').value,
      prevAccountingName: document.getElementById('prev-accounting-name').value,
      prevAccountingPhone: document.getElementById('prev-accounting-phone').value,
      prevAccountingContact: document.getElementById('prev-accounting-contact').value,
      subestablished: document.querySelector('input[name="company-subestablished"]:checked') ? document.querySelector('input[name="company-subestablished"]:checked').value : 'Não'
    },
    activity: {
      desc: document.getElementById('activity-desc').value,
      cnae: document.getElementById('activity-cnae').value,
      cnaesFile: attachedFileBase64,
      cnaesFileName: attachedFileName
    },
    partners: partners,
    employeesQty: parseInt(document.getElementById('employees-qty').value) || 0,
    certificate: {
      has: certHas,
      type: certType,
      validity: certValidity
    },
    fiscalPasswords: {
      web: document.getElementById('fiscal-pwd-web').value,
      prodigi: document.getElementById('fiscal-pwd-prodigi').value,
      ginfes: document.getElementById('fiscal-pwd-ginfes').value,
      giss: document.getElementById('fiscal-pwd-giss').value,
      simples: document.getElementById('fiscal-pwd-simples').value,
      state: document.getElementById('fiscal-pwd-state').value,
      others: document.getElementById('fiscal-pwd-others').value
    },
    implantation: {
      date: document.getElementById('kickoff-date').value,
      user: document.getElementById('kickoff-user').value,
      signatureName: '',
      notes: document.getElementById('implantation-notes').value
    }
  };

  try {
    await dbSave(kickoffData);
    
    // Limpa o rascunho temporario do cliente apos enviar com sucesso
    clearFormDraft();
    
    // Tenta enviar a notificacao por e-mail (se configurado)
    await sendEmailNotification(kickoffData);
    
    if (checkClientMode()) {
      // Oculta o formulário
      const formCard = document.querySelector('.form-card');
      if (formCard) formCard.style.display = 'none';
      
      // Exibe a tela de sucesso
      const successScreen = document.getElementById('success-screen');
      if (successScreen) successScreen.style.display = 'flex';
      
      // Rola a página para o topo de forma suave
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      alert("Kick-off salvo com sucesso!");
      if (confirm("Deseja baixar a ficha individual formatada em arquivo (.JSON) agora?\n(Recomendado para salvar no OneDrive com o nome da empresa)")) {
        exportSingleClientJSONFromData(kickoffData);
      }
      switchTab('dashboard');
    }
  } catch (error) {
    alert("Erro ao salvar cadastro: " + error.message);
  }
}

// --- 11. APRESENTAÇÃO DO BANCO DE DADOS (DASHBOARD) ---
async function renderDashboard() {
  const tbody = document.getElementById('client-table-body');
  const emptyState = document.getElementById('table-empty-state');
  const isAdmin = checkAdminStatus();
  
  tbody.innerHTML = '';
  
  let list = [];
  try {
    list = await dbGetAll();
  } catch (error) {
    console.error("Falha ao recuperar dados:", error);
    return;
  }

  const searchVal = document.getElementById('search-input').value.toLowerCase();
  const filterRegime = document.getElementById('filter-regime').value;

  const filtered = list.filter(item => {
    const matchesSearch = 
      item.company.razaoSocial.toLowerCase().includes(searchVal) ||
      (item.company.cnpj && item.company.cnpj.includes(searchVal)) ||
      (item.implantation.user && item.implantation.user.toLowerCase().includes(searchVal)) ||
      (item.partners && item.partners.some(p => p.name.toLowerCase().includes(searchVal)));

    const matchesRegime = filterRegime === '' || item.company.regime === filterRegime;

    return matchesSearch && matchesRegime;
  });

  document.getElementById('metric-total').textContent = list.length;
  document.getElementById('metric-simples').textContent = list.filter(item => item.company.regime === 'Simples Nacional').length;
  document.getElementById('metric-presumido').textContent = list.filter(item => item.company.regime === 'Lucro Presumido').length;
  document.getElementById('metric-real').textContent = list.filter(item => item.company.regime === 'Lucro Real' || item.company.regime === 'MEI' || item.company.regime === 'Outros').length;

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    const partnersBadges = item.partners ? item.partners.map(p => `<span class="partner-capsule">${p.name.split(' ')[0]}</span>`).join(' ') : '';

    let certLabel = '';
    if (item.certificate.has === 'Sim') {
      const parts = item.certificate.validity.split('-');
      const dateFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.certificate.validity;
      certLabel = `<span style="color:var(--success); font-weight:600;">Sim (${item.certificate.type})</span><br><small style="color:var(--text-muted);">Validade: ${dateFmt}</small>`;
    } else {
      certLabel = `<span style="color:var(--danger); font-weight:600;">Não possui</span>`;
    }

    let tagClass = 'tag-simples';
    if (item.company.regime === 'Lucro Presumido') tagClass = 'tag-presumido';
    if (item.company.regime === 'Lucro Real') tagClass = 'tag-real';
    if (item.company.regime === 'MEI') tagClass = 'tag-mei';

    const partsDate = item.implantation.date ? item.implantation.date.split('-') : [];
    const dateKickoffFmt = partsDate.length === 3 ? `${partsDate[2]}/${partsDate[1]}/${partsDate[0]}` : item.implantation.date || '-';

    tr.innerHTML = `
      <td>
        <div class="company-primary-cell">
          <span class="company-title" style="cursor:pointer; text-decoration:underline; color:var(--primary);" onclick="viewClient('${item.id}')" title="Clique para visualizar a ficha">${item.company.razaoSocial || 'Sem Razão Social'}</span>
          <span class="company-sub">CNPJ: ${item.company.cnpj || 'PENDENTE'}</span>
        </div>
      </td>
      <td>
        <span class="tag ${tagClass}">${item.company.regime || 'Não informado'}</span>
        <div class="company-sub" style="margin-top:4px; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.activity.desc || ''}">${item.activity.desc || '-'}</div>
      </td>
      <td>
        <div style="max-width:180px;">${partnersBadges}</div>
      </td>
      <td>
        ${certLabel}
      </td>
      <td>
        <span style="font-weight:600;">${dateKickoffFmt}</span><br>
        <small style="color:var(--text-muted);">${item.implantation.user || '-'}</small>
      </td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-outline btn-sm" onclick="viewClient('${item.id}')" title="Visualizar Ficha na tela" style="background-color:var(--primary-light); color:white; border:none;">Visualizar</button>
          <button class="btn btn-outline btn-sm" onclick="editClient('${item.id}')" title="Alterar dados" style="display: ${isAdmin ? 'inline-block' : 'none'};">Alterar</button>
          <button class="btn btn-primary btn-sm" onclick="printClientPDF('${item.id}')" title="Imprimir/Salvar PDF">PDF</button>
          <button class="btn btn-accent btn-sm" onclick="exportSingleClientJSONById('${item.id}')" title="Salvar arquivo individual">JSON</button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient('${item.id}')" title="Excluir do banco" style="display: ${isAdmin ? 'inline-block' : 'none'};">Excluir</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// --- 12. AÇÕES DO DASHBOARD ---
window.editClient = async function(id) {
  try {
    const list = await dbGetAll();
    const item = list.find(x => x.id === id);
    if (!item) return;

    resetForm();

    document.getElementById('edit-client-id').value = item.id;
    document.getElementById('form-action-title').textContent = 'Alterar Kick-off: ' + (item.company.razaoSocial || 'Empresa sem nome');

    // Dados da Empresa
    document.getElementById('company-razao-social').value = item.company.razaoSocial || '';
    document.getElementById('company-nome-fantasia').value = item.company.nomeFantasia || '';
    document.getElementById('company-cnpj').value = item.company.cnpj || '';
    document.getElementById('company-regime').value = item.company.regime || '';
    document.getElementById('company-telefone').value = item.company.telefone || '';
    document.getElementById('company-email').value = item.company.email || '';
    
    // Subestabelecimento
    const subestVal = item.company.subestablished || 'Não';
    const yesRadio = document.getElementById('company-subestablished-yes');
    const noRadio = document.getElementById('company-subestablished-no');
    if (yesRadio && noRadio) {
      if (subestVal === 'Sim') {
        yesRadio.checked = true;
      } else {
        noRadio.checked = true;
      }
    }
    
    document.getElementById('address-cep').value = item.company.cep || '';
    document.getElementById('address-logradouro').value = item.company.logradouro || '';
    document.getElementById('address-numero').value = item.company.numero || '';
    document.getElementById('address-complemento').value = item.company.complemento || '';
    document.getElementById('address-bairro').value = item.company.bairro || '';
    document.getElementById('address-cidade').value = item.company.cidade || '';
    document.getElementById('address-uf').value = item.company.uf || '';

    // Company files
    if (item.company.proofAddressFile) {
      attachedProofAddressBase64 = item.company.proofAddressFile;
      attachedProofAddressName = item.company.proofAddressFileName || 'comprovante_endereco.pdf';
      document.getElementById('company-proof-address-file-status').textContent = `Anexado: ${attachedProofAddressName}`;
      document.getElementById('btn-clear-company-proof-address').style.display = 'inline-block';
      const dlBtn = document.getElementById('btn-download-company-proof-address');
      dlBtn.href = attachedProofAddressBase64;
      dlBtn.download = attachedProofAddressName;
      dlBtn.style.display = 'inline-block';
    }
    
    if (item.company.iptuFile) {
      attachedIptuBase64 = item.company.iptuFile;
      attachedIptuName = item.company.iptuFileName || 'iptu.pdf';
      document.getElementById('company-iptu-file-status').textContent = `Anexado: ${attachedIptuName}`;
      document.getElementById('btn-clear-company-iptu').style.display = 'inline-block';
      const dlBtn = document.getElementById('btn-download-company-iptu');
      dlBtn.href = attachedIptuBase64;
      dlBtn.download = attachedIptuName;
      dlBtn.style.display = 'inline-block';
    }

    // Previous Accounting
    let prevAccVal = item.company.prevAccountingHas || 'Nova';
    if (prevAccVal === 'Sim') prevAccVal = 'Migração';
    if (prevAccVal === 'Não') prevAccVal = 'Nova';

    const radioBtn = document.querySelector(`input[name="prev-accounting-has"][value="${prevAccVal}"]`);
    if (radioBtn) radioBtn.checked = true;

    const prevAccFields = document.querySelectorAll('.prev-accounting-fields');
    if (prevAccVal === 'Migração') {
      prevAccFields.forEach(f => f.style.display = 'block');
      document.getElementById('prev-accounting-name').value = item.company.prevAccountingName || '';
      document.getElementById('prev-accounting-phone').value = item.company.prevAccountingPhone || '';
      document.getElementById('prev-accounting-contact').value = item.company.prevAccountingContact || '';
    } else {
      prevAccFields.forEach(f => f.style.display = 'none');
    }

    // Atividade
    document.getElementById('activity-desc').value = item.activity.desc || '';
    document.getElementById('activity-cnae').value = item.activity.cnae || '';
    if (item.activity.cnaesFile) {
      attachedFileBase64 = item.activity.cnaesFile;
      attachedFileName = item.activity.cnaesFileName || 'relatorio_cnaes.pdf';
      document.getElementById('cnaes-file-status').textContent = `Anexado: ${attachedFileName}`;
      document.getElementById('btn-clear-cnaes-file').style.display = 'inline-block';
      
      const dlBtn = document.getElementById('btn-download-cnaes-file');
      dlBtn.href = attachedFileBase64;
      dlBtn.download = attachedFileName;
      dlBtn.style.display = 'inline-block';
    }

    // Sócios
    document.getElementById('partners-container').innerHTML = '';
    if (item.partners && item.partners.length > 0) {
      item.partners.forEach(partner => addPartnerCard(partner));
    } else {
      addPartnerCard();
    }

    // Funcionários e Certificado
    document.getElementById('employees-qty').value = item.employeesQty || 0;
    
    const certHasVal = item.certificate.has || 'Não';
    document.querySelector(`input[name="cert-has"][value="${certHasVal}"]`).checked = true;
    if (certHasVal === 'Sim') {
      document.querySelectorAll('.cert-fields').forEach(f => f.style.display = 'block');
      document.getElementById('cert-type').value = item.certificate.type || '';
      document.getElementById('cert-validity').value = item.certificate.validity || '';
    }

    // Senhas de Acesso
    const fp = item.fiscalPasswords || {};
    document.getElementById('fiscal-pwd-web').value = fp.web || '';
    document.getElementById('fiscal-pwd-prodigi').value = fp.prodigi || '';
    document.getElementById('fiscal-pwd-ginfes').value = fp.ginfes || '';
    document.getElementById('fiscal-pwd-giss').value = fp.giss || '';
    document.getElementById('fiscal-pwd-simples').value = fp.simples || '';
    document.getElementById('fiscal-pwd-state').value = fp.state || '';
    document.getElementById('fiscal-pwd-others').value = fp.others || '';

    // Implantação
    document.getElementById('kickoff-date').value = item.implantation.date || '';
    document.getElementById('kickoff-user').value = item.implantation.user || '';
    document.getElementById('implantation-notes').value = item.implantation.notes || '';

    switchTab('formulario');
  } catch (error) {
    alert("Erro ao editar registro: " + error.message);
  }
};

window.deleteClient = async function(id) {
  if (confirm("Tem certeza que deseja excluir esta ficha de implantação?")) {
    try {
      await dbDelete(id);
      renderDashboard();
    } catch (error) {
      alert("Erro ao excluir: " + error.message);
    }
  }
};

// --- 13. EXPORTAÇÃO INDIVIDUAL E BANCO DE DADOS (JSON) ---
window.exportSingleClientJSONById = async function(id) {
  try {
    const list = await dbGetAll();
    const item = list.find(x => x.id === id);
    if (!item) return;
    exportSingleClientJSONFromData(item);
  } catch (e) {
    alert("Erro ao exportar JSON: " + e.message);
  }
};

function exportSingleClientJSONFromData(data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const cleanName = data.company.razaoSocial ? data.company.razaoSocial.replace(/[\\/:*?"<>|]/g, "_").trim() : 'sem_nome';
  const filename = `Kickoff_RBM_${cleanName}.json`;

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Backup geral do banco
function exportFullDatabase() {
  dbGetAll().then(list => {
    if (list.length === 0) {
      alert("O banco de dados está vazio. Nada para exportar.");
      return;
    }
    const jsonStr = JSON.stringify(list, null, 2);
    const filename = `Backup_RBM_Kickoffs_${new Date().toISOString().split('T')[0]}.json`;

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// Importar Backup geral
function importFullDatabase(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      const data = JSON.parse(event.target.result);
      if (!Array.isArray(data)) {
        alert("O arquivo de backup é inválido (deve ser um array de fichas).");
        return;
      }

      if (confirm(`Isso irá mesclar/sobrescrever ${data.length} registros no banco de dados. Confirmar?`)) {
        for (let item of data) {
          if (item.id && item.company) {
            await dbSave(item);
          }
        }
        alert("Banco de dados importado com sucesso!");
        renderDashboard();
      }
    } catch (err) {
      alert("Erro ao ler arquivo de backup: " + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// Importar Ficha única a partir do Dashboard
function importSingleClientJSON(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(event) {
    try {
      const item = JSON.parse(event.target.result);
      if (!item.company) {
        alert("Este arquivo não parece ser uma ficha de kick-off de cliente válida.");
        return;
      }

      const list = await dbGetAll();
      const existing = list.find(x => x.id === item.id || (item.company.cnpj && x.company.cnpj === item.company.cnpj));

      let companyName = item.company.razaoSocial || 'Empresa sem Razão Social';
      let msg = `Encontrada ficha de: ${companyName}.\n`;
      if (existing) {
        msg += "Já existe um registro dessa empresa. Deseja sobrescrever os dados locais pelos dados do arquivo?";
      } else {
        msg += "Deseja salvar esta ficha no seu banco de dados local para visualização e edição?";
      }

      if (confirm(msg)) {
        if (existing) {
          item.id = existing.id;
        } else {
          if (!item.id) item.id = 'kickoff_' + Date.now();
        }
        await dbSave(item);
        alert("Ficha importada e salva com sucesso!");
        renderDashboard();
      }
    } catch (err) {
      alert("Erro ao decodificar a ficha JSON: " + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}

// --- 13.1 CONFIGURAÇÕES E GERENCIAMENTO DA NUVEM ---
async function updateCloudStatusUI() {
  const badge = document.getElementById('cloud-status-badge');
  const config = getCloudConfig();
  
  if (!config.active || !config.url || !config.key) {
    badge.className = 'cloud-badge offline';
    badge.textContent = 'Local';
    badge.title = 'Banco de dados local (Offline)';
    return;
  }
  
  try {
    // Rápido teste de conexão com o REST API do Supabase
    const response = await fetch(`${config.url}/rest/v1/kickoffs?select=id&limit=1`, {
      method: 'GET',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`
      }
    });
    if (response.ok) {
      badge.className = 'cloud-badge online';
      badge.textContent = 'Online';
      badge.title = 'Conectado à nuvem (Supabase)';
    } else {
      badge.className = 'cloud-badge offline';
      badge.textContent = 'Erro';
      badge.title = 'Configurações de nuvem inválidas ou sem permissões';
    }
  } catch (e) {
    badge.className = 'cloud-badge offline';
    badge.textContent = 'Desconectado';
    badge.title = 'Sem conexão com a internet ou servidor inacessível';
  }
}

function openCloudModal() {
  const config = getCloudConfig();
  document.getElementById('cloud-supabase-url').value = config.url || '';
  document.getElementById('cloud-supabase-key').value = config.key || '';
  document.getElementById('cloud-active-checkbox').checked = !!config.active;
  document.getElementById('cloud-modal').style.display = 'flex';
}

function closeCloudModal() {
  document.getElementById('cloud-modal').style.display = 'none';
}

async function saveCloudSettings() {
  const url = document.getElementById('cloud-supabase-url').value.trim();
  const key = document.getElementById('cloud-supabase-key').value.trim();
  const active = document.getElementById('cloud-active-checkbox').checked;
  
  const config = { url, key, active };
  localStorage.setItem('rbm_cloud_config', JSON.stringify(config));
  
  closeCloudModal();
  await updateCloudStatusUI();
  renderDashboard();
}

// --- 14. GERAÇÃO DO LAYOUT DE IMPRESSÃO (A4 FORMULÁRIO) ---
window.printClientPDF = async function(id) {
  try {
    const list = await dbGetAll();
    const item = list.find(x => x.id === id);
    if (!item) return;

    const printContainer = document.getElementById('print-sheet-container');
    printContainer.innerHTML = ''; // Limpa anterior

    // Prepara dados dos Sócios em Cards ou tabelas
    let partnersRows = '';
    item.partners.forEach((p, index) => {
      const showRegime = (p.maritalStatus === 'Casado(a)' || p.maritalStatus === 'União Estável');
      const regimeText = showRegime ? (p.regimeBens || 'Não informado') : 'N/A';
      
      // Dependentes do sócio
      let partnerDepsRows = '';
      if (p.dependents && p.dependents.length > 0) {
        p.dependents.forEach(d => {
          const dParts = d.birthDate ? d.birthDate.split('-') : [];
          const dobFmt = dParts.length === 3 ? `${dParts[2]}/${dParts[1]}/${dParts[0]}` : d.birthDate || '-';
          partnerDepsRows += `
            <tr>
              <td>${d.name || '-'}</td>
              <td style="text-align:center;">${d.cpf || '-'}</td>
              <td style="text-align:center;">${dobFmt}</td>
              <td style="text-align:center; font-weight:bold;">${calculateAge(d.birthDate)}</td>
            </tr>
          `;
        });
      } else {
        partnerDepsRows = `
          <tr>
            <td colspan="4" style="text-align:center; color:#555; padding:4px; font-size:8pt;">Nenhum dependente informado para este sócio</td>
          </tr>
        `;
      }

      partnersRows += `
        <div class="partner-print-card" style="margin-bottom:12px; page-break-inside:avoid;">
          <div class="partner-print-card-title">Sócio ${index + 1}: ${p.name || 'Sócio sem nome'}</div>
          <table class="print-table" style="border:none; margin-bottom:4px; width:100%;">
            <tr style="border:none;">
              <td style="width:20%; border:none; padding:2px;">
                <span class="print-field-label">CPF</span>
                <span class="print-field-value">${p.cpf || '-'}</span>
              </td>
              <td style="width:20%; border:none; padding:2px;">
                <span class="print-field-label">RG</span>
                <span class="print-field-value">${p.rg || '-'}</span>
              </td>
              <td style="width:20%; border:none; padding:2px;">
                <span class="print-field-label">Data Nasc.</span>
                <span class="print-field-value">${p.birthDate ? p.birthDate.split('-').reverse().join('/') : '-'}</span>
              </td>
              <td style="width:20%; border:none; padding:2px;">
                <span class="print-field-label">Nacionalidade</span>
                <span class="print-field-value">${p.nacionalidade || '-'}</span>
              </td>
              <td style="width:20%; border:none; padding:2px;">
                <span class="print-field-label">Cor / Raça</span>
                <span class="print-field-value">${p.race || '-'}</span>
              </td>
            </tr>
            <tr style="border:none;">
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">Estado Civil</span>
                <span class="print-field-value">${p.maritalStatus || '-'}</span>
              </td>
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">Regime de Bens</span>
                <span class="print-field-value">${regimeText}</span>
              </td>
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">Nome do Pai</span>
                <span class="print-field-value">${p.father || '-'}</span>
              </td>
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">Nome da Mãe</span>
                <span class="print-field-value">${p.mother || '-'}</span>
              </td>
            </tr>
            <tr style="border:none;">
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">Telefone</span>
                <span class="print-field-value">${p.phone || '-'}</span>
              </td>
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">E-mail</span>
                <span class="print-field-value">${p.email || '-'}</span>
              </td>
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">Grau de Escolaridade</span>
                <span class="print-field-value">${p.educationLevel || '-'}</span>
              </td>
              <td style="width:25%; border:none; padding:2px;">
                <span class="print-field-label">Doc. CPF c/ Foto</span>
                <span class="print-field-value" style="font-size:7.5pt; font-weight:bold;">${p.photoIdFile ? 'ANEXADO' : 'NÃO ANEXADO'}</span>
              </td>
            </tr>
            <tr style="border:none;">
              <td style="border:none; padding:2px;" colspan="4">
                <span class="print-field-label">Endereço Residencial do Sócio</span>
                <span class="print-field-value">
                  ${p.logradouro || ''}, ${p.numCompl || ''} - Bairro ${p.bairro || ''} - ${p.cidade || ''}/${p.uf || ''} - CEP: ${p.cep || ''}
                </span>
              </td>
            </tr>
            <tr style="border:none;">
              <td style="border:none; padding:2px;" colspan="4">
                <span class="print-field-label">Previdência & Pró-labore</span>
                <div style="font-size:8pt; margin-top:2px;">
                  <div class="print-checkbox">
                    <span class="print-checkbox-box">${p.inssContrib === 'Sim' ? 'X' : '&nbsp;&nbsp;'}</span>
                    <span>Contribui INSS em outra empresa ${p.inssDetails ? '(' + p.inssDetails + ')' : ''}</span>
                  </div>
                  <div class="print-checkbox">
                    <span class="print-checkbox-box">${p.retired === 'Sim' ? 'X' : '&nbsp;&nbsp;'}</span>
                    <span>É aposentado</span>
                  </div>
                  <div class="print-checkbox">
                    <span class="print-checkbox-box">${p.prolaboreHas === 'Sim' ? 'X' : '&nbsp;&nbsp;'}</span>
                    <span>Terá retirada de Pró-labore ${p.prolaboreHas === 'Sim' && p.prolaboreVal ? '(Valor: ' + p.prolaboreVal + ')' : ''}</span>
                  </div>
                </div>
              </td>
            </tr>
            <tr style="border:none;">
              <td style="border:none; padding:2px;" colspan="4">
                <div class="print-checkbox" style="margin-top:2px;">
                  <span class="print-checkbox-box">${p.isAdmin ? 'X' : '&nbsp;&nbsp;'}</span>
                  <span style="font-size: 8pt; font-weight:600;">Sócio administrador? (Assina pela empresa)</span>
                </div>
                <div class="print-checkbox" style="margin-top:2px;">
                  <span class="print-checkbox-box">${p.isRfResp ? 'X' : '&nbsp;&nbsp;'}</span>
                  <span style="font-size: 8pt; font-weight:600;">Responsável perante a Receita Federal?</span>
                </div>
              </td>
            </tr>
          </table>
          
          <div style="margin-top:4px; padding-left:8px; border-left:2px solid #000;">
            <div style="font-size:7.5pt; font-weight:bold; text-transform:uppercase; margin-bottom:2px;">Dependentes para IR deste Sócio:</div>
            <table class="print-table" style="margin-bottom:0;">
              <thead>
                <tr>
                  <th style="padding:2px 4px; font-size:7.5pt; width:45%;">Nome do Dependente</th>
                  <th style="padding:2px 4px; font-size:7.5pt; width:25%; text-align:center;">CPF</th>
                  <th style="padding:2px 4px; font-size:7.5pt; width:20%; text-align:center;">Data Nasc.</th>
                  <th style="padding:2px 4px; font-size:7.5pt; width:10%; text-align:center;">Idade</th>
                </tr>
              </thead>
              <tbody>
                ${partnerDepsRows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    // Datas formatadas para exibição
    const partsDate = item.implantation.date ? item.implantation.date.split('-') : [];
    const dateFmt = partsDate.length === 3 ? `${partsDate[2]}/${partsDate[1]}/${partsDate[0]}` : item.implantation.date || '-';

    const partsVal = item.certificate.validity ? item.certificate.validity.split('-') : [];
    const valFmt = partsVal.length === 3 ? `${partsVal[2]}/${partsVal[1]}/${partsVal[0]}` : (item.certificate.validity || 'N/A');

    // Prepara bloco de Contabilidade Anterior
    let prevAccountingBlock = '';
    if (item.company.prevAccountingHas === 'Sim' || item.company.prevAccountingHas === 'Migração') {
      prevAccountingBlock = `
        <div class="print-section-title">Contabilidade Anterior (Transição)</div>
        <table class="print-table">
          <tr>
            <td style="width: 40%;">
              <span class="print-field-label">Nome da Contabilidade Anterior</span>
              <div class="print-field-value" style="font-weight:bold;">${item.company.prevAccountingName || '-'}</div>
            </td>
            <td style="width: 30%;">
              <span class="print-field-label">Telefone de Contato</span>
              <div class="print-field-value">${item.company.prevAccountingPhone || '-'}</div>
            </td>
            <td style="width: 30%;">
              <span class="print-field-label">Nome do Contato</span>
              <div class="print-field-value">${item.company.prevAccountingContact || '-'}</div>
            </td>
          </tr>
        </table>
      `;
    }

    // Prepara bloco de Observações Internas
    let notesBlock = '';
    if (item.implantation && item.implantation.notes) {
      notesBlock = `
        <div class="print-section-title">Observações Internas (Uso Exclusivo RBM)</div>
        <div style="font-size: 8.5pt; border: 1px solid #000; padding: 8px; border-radius: 4px; background-color: #fafafa; white-space: pre-wrap; margin-bottom: 15px; line-height: 1.3;">${item.implantation.notes}</div>
      `;
    }

    // Prepara bloco de Senhas de Acesso (Área Fiscal)
    const fp = item.fiscalPasswords || {};
    const hasFiscalPasswords = fp.web || fp.prodigi || fp.ginfes || fp.giss || fp.simples || fp.state || fp.others;
    
    let fiscalPasswordsBlock = '';
    if (hasFiscalPasswords) {
      fiscalPasswordsBlock = `
        <!-- SEÇÃO 6: SENHAS DE ACESSO (ÁREA FISCAL) -->
        <div class="print-section-title">6. Senhas de Acesso (Área Fiscal)</div>
        <table class="print-table">
          <tr>
            <td style="width: 33%;">
              <span class="print-field-label">Senha Web / Nota do Milhão (Municipal)</span>
              <div class="print-field-value">${fp.web || '-'}</div>
            </td>
            <td style="width: 33%;">
              <span class="print-field-label">PRODIGI (Municipal)</span>
              <div class="print-field-value">${fp.prodigi || '-'}</div>
            </td>
            <td style="width: 34%;">
              <span class="print-field-label">GINFES (Municipal)</span>
              <div class="print-field-value">${fp.ginfes || '-'}</div>
            </td>
          </tr>
          <tr>
            <td style="width: 33%;">
              <span class="print-field-label">GISS (Municipal)</span>
              <div class="print-field-value">${fp.giss || '-'}</div>
            </td>
            <td style="width: 33%;">
              <span class="print-field-label">Senha Simples Nacional</span>
              <div class="print-field-value">${fp.simples || '-'}</div>
            </td>
            <td style="width: 34%;">
              <span class="print-field-label">Senha Estadual (Posto Fiscal)</span>
              <div class="print-field-value">${fp.state || '-'}</div>
            </td>
          </tr>
          <tr>
            <td colspan="3">
              <span class="print-field-label">Outras Senhas Pertinentes</span>
              <div class="print-field-value" style="white-space: pre-wrap; font-size: 8.5pt;">${fp.others || '-'}</div>
            </td>
          </tr>
        </table>
      `;
    }

    // Gera bloco de visualização dos documentos anexados (imagens ou avisos estruturados de PDF)
    let attachmentsBlock = '';
    const isImageBase64 = (str) => str && typeof str === 'string' && str.startsWith('data:image/');

    const renderPrintAttachment = (title, file, fileName) => {
      if (!file) return '';
      if (isImageBase64(file)) {
        return `
          <div style="page-break-before: always; padding-top: 15px; text-align: center;">
            <div class="print-section-title" style="text-align: left; background-color: #1a365d; color: white; padding: 4px 8px; font-size: 9pt; font-weight: bold;">Anexo: ${title} (${fileName || 'Imagem'})</div>
            <img src="${file}" style="max-width: 100%; max-height: 700px; border: 1px solid #ddd; border-radius: 4px; margin-top: 10px; object-fit: contain;">
          </div>
        `;
      } else {
        // Bloco profissional de aviso/fallback para PDF impresso
        return `
          <div style="page-break-before: always; padding-top: 20px; text-align: left; border: 2px solid #333; padding: 20px; border-radius: 8px; background-color: #f7fafc; margin-top: 20px; min-height: 250px;">
            <div class="print-section-title" style="background-color: #718096; color: white; padding: 6px 12px; font-size: 10pt; font-weight: bold; text-transform: uppercase;">Documento Anexo (Arquivo PDF / Não-Imagem)</div>
            <div style="margin-top: 20px; font-size: 11pt;"><strong>Identificação do Anexo:</strong> ${title}</div>
            <div style="margin-top: 10px; font-size: 10pt;"><strong>Nome do Arquivo Original:</strong> <span style="font-family: monospace; background:#edf2f7; padding: 2px 6px; border-radius:4px;">${fileName || 'documento.pdf'}</span></div>
            <div style="margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 15px; color: #4a5568; font-size: 9pt; line-height: 1.5;">
              <strong>Instruções de Acesso:</strong><br>
              Este documento foi anexado em formato PDF. Como arquivos PDF contêm múltiplas páginas e dados vetoriais que não podem ser fundidos diretamente na folha de impressão A4 do navegador, o documento original está salvo e seguro em nosso banco de dados.
              <br><br>
              Para abrir, visualizar ou baixar o documento completo original:
              <ul style="margin-top: 5px; padding-left: 20px;">
                <li>Abra o sistema de Kick-off da RBM.</li>
                <li>Localize a ficha do cliente <strong>${item.company.razaoSocial || 'Sem Nome'}</strong>.</li>
                <li>Clique em <strong>"Visualizar"</strong> na tabela (ou no nome da empresa).</li>
                <li>Na janela modal exibida na tela, clique no link de download do documento desejado.</li>
              </ul>
            </div>
          </div>
        `;
      }
    };

    if (item.company.proofAddressFile) {
      attachmentsBlock += renderPrintAttachment('Comprovante de Endereço da Empresa', item.company.proofAddressFile, item.company.proofAddressFileName);
    }
    if (item.company.iptuFile) {
      attachmentsBlock += renderPrintAttachment('Cópia do IPTU do Imóvel', item.company.iptuFile, item.company.iptuFileName);
    }
    if (item.activity.cnaesFile) {
      attachmentsBlock += renderPrintAttachment('Relatório de CNAEs da Empresa', item.activity.cnaesFile, item.activity.cnaesFileName);
    }
    if (item.partners && item.partners.length > 0) {
      item.partners.forEach((p, idxSocio) => {
        const filesList = p.photoIdFiles || [];
        if (filesList.length === 0 && p.photoIdFile) {
          filesList.push({ file: p.photoIdFile, name: p.photoIdFileName });
        }
        filesList.forEach((doc, idxDoc) => {
          if (doc && doc.file) {
            attachmentsBlock += renderPrintAttachment(`Documento Sócio ${idxSocio + 1} - ${p.name || 'Sem nome'} (Doc ${idxDoc + 1})`, doc.file, doc.name);
          }
        });
      });
    }

    // Constrói o HTML de Impressão
    printContainer.innerHTML = `
      <div class="print-page">
        <!-- CABEÇALHO -->
        <div class="print-header">
          <div class="print-header-left">
            <img src="logo_rbm.png" class="print-logo" onerror="this.src='logo_rbm_horizontal.png'; this.onerror=function(){this.style.display='none';}">
            <div class="print-header-title-box">
              <h1>RBM CONTABILIDADE</h1>
              <p>TERMO DE IMPLANTAÇÃO E KICK-OFF DE NOVO CLIENTE</p>
            </div>
          </div>
          <div class="print-header-meta">
            <div><strong>Data Kick-off:</strong> ${dateFmt}</div>
            <div><strong>Responsável RBM:</strong> ${item.implantation.user || '-'}</div>
          </div>
        </div>

        <!-- AVISO DE TRANSIÇÃO / CONSTITUIÇÃO EM ANDAMENTO -->
        <div style="border: 1px solid #cfa153; background-color: #fafafa; padding: 6px 10px; margin-bottom: 12px; border-left: 3px solid #cfa153; font-size: 7.5pt; line-height: 1.35; text-align: justify;">
          <strong>Nota de Transição & Abertura:</strong> Este documento compila dados societários e cadastrais provisórios fornecidos preliminarmente para fins de abertura ou migração de contabilidade anterior. Em processos de abertura, nos quais a empresa jurídica ainda não se encontra formalmente constituída no momento deste preenchimento, as informações contidas estão sujeitas a revisões societárias, cadastrais ou tributárias posteriores à sua efetiva implantação na RBM Contabilidade.
        </div>

        <!-- SEÇÃO 1: DADOS DA EMPRESA -->
        <div class="print-section-title">1. Dados da Empresa</div>
        <table class="print-table">
          <tr>
            <td colspan="2" style="width: 60%;">
              <span class="print-field-label">Razão Social</span>
              <div class="print-field-value" style="font-weight:bold;">${item.company.razaoSocial || 'Sem nome'}</div>
            </td>
            <td style="width: 40%;">
              <span class="print-field-label">Nome Fantasia</span>
              <div class="print-field-value">${item.company.nomeFantasia || '-'}</div>
            </td>
          </tr>
          <tr>
            <td style="width: 30%;">
              <span class="print-field-label">CNPJ</span>
              <div class="print-field-value">${item.company.cnpj || 'PENDENTE'}</div>
            </td>
            <td style="width: 30%;">
              <span class="print-field-label">Regime Tributário</span>
              <div class="print-field-value">${item.company.regime || '-'}</div>
            </td>
            <td style="width: 40%;">
              <span class="print-field-label">Tipo de Entrada</span>
              <div class="print-field-value" style="font-weight:bold;">${item.company.prevAccountingHas === 'Migração' || item.company.prevAccountingHas === 'Sim' ? 'Migração de Contabilidade' : 'Empresa Nova (Abertura)'}</div>
            </td>
          </tr>
          <tr>
            <td style="width: 35%;">
              <span class="print-field-label">E-mail da Empresa</span>
              <div class="print-field-value">${item.company.email || '-'}</div>
            </td>
            <td style="width: 35%;">
              <span class="print-field-label">Telefone</span>
              <div class="print-field-value">${item.company.telefone || '-'}</div>
            </td>
            <td style="width: 30%;">
              <span class="print-field-label">Empresa Subestabelecida?</span>
              <div class="print-field-value" style="font-weight:bold;">${item.company.subestablished || 'Não'}</div>
            </td>
          </tr>
          <tr>
            <td colspan="3">
              <span class="print-field-label">Endereço Completo</span>
              <div class="print-field-value">
                ${item.company.logradouro || '-'}, Nº ${item.company.numero || ''} 
                ${item.company.complemento ? ' - ' + item.company.complemento : ''} 
                - Bairro ${item.company.bairro || '-'} - ${item.company.cidade || '-'}/${item.company.uf || ''} 
                - CEP: ${item.company.cep || '-'}
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="3">
              <span class="print-field-label">Documentos da Empresa Anexados</span>
              <div class="print-checkbox">
                <span class="print-checkbox-box">${item.company.proofAddressFile ? 'X' : '&nbsp;&nbsp;'}</span>
                <span>Comprovante de Endereço da Empresa</span>
              </div>
              <div class="print-checkbox">
                <span class="print-checkbox-box">${item.company.iptuFile ? 'X' : '&nbsp;&nbsp;'}</span>
                <span>Cópia do IPTU do Imóvel</span>
              </div>
            </td>
          </tr>
        </table>

        <!-- SEÇÃO 2: ATIVIDADE DA EMPRESA -->
        <div class="print-section-title">2. Atividade da Empresa</div>
        <table class="print-table">
          <tr>
            <td style="width: 75%;">
              <span class="print-field-label">Descrição detalhada da atividade (o que realmente faz)</span>
              <div class="print-field-value" style="white-space: pre-wrap; font-size: 8.5pt;">${item.activity.desc || '-'}</div>
            </td>
            <td style="width: 25%;">
              <span class="print-field-label">CNAE Principal</span>
              <div class="print-field-value" style="font-weight:bold;">${item.activity.cnae || '-'}</div>
              <div style="margin-top: 15px;">
                <div class="print-checkbox">
                  <span class="print-checkbox-box">${item.activity.cnaesFile ? 'X' : '&nbsp;&nbsp;'}</span>
                  <span style="font-size:7pt; color:#333; font-weight:600;">Relatório de CNAEs Anexo</span>
                </div>
              </div>
            </td>
          </tr>
        </table>

        <!-- CONTABILIDADE ANTERIOR -->
        ${prevAccountingBlock}

        <!-- SEÇÃO 3: DADOS DOS SÓCIOS -->
        <div class="print-section-title">3. Dados dos Sócios</div>
        <div>
          ${partnersRows}
        </div>

        <!-- SEÇÃO 4: FUNCIONÁRIOS -->
        <div class="print-section-title">4. Funcionários</div>
        <table class="print-table">
          <tr>
            <td>
              <span class="print-field-label">Quantidade de Funcionários</span>
              <div class="print-field-value" style="font-weight:bold; font-size:9.5pt;">${item.employeesQty || 0} funcionários</div>
            </td>
          </tr>
        </table>

        <!-- SEÇÃO 5: CERTIFICADO DIGITAL -->
        <div class="print-section-title">5. Certificado Digital</div>
        <table class="print-table">
          <tr>
            <td style="width: 33%;">
              <span class="print-field-label">Possui Certificado Digital?</span>
              <div style="margin-top: 4px;">
                <div class="print-checkbox">
                  <span class="print-checkbox-box">${item.certificate.has === 'Sim' ? 'X' : '&nbsp;&nbsp;'}</span>
                  <span>Sim (${item.certificate.type || '-'})</span>
                </div>
                <div class="print-checkbox" style="margin-top: 2px;">
                  <span class="print-checkbox-box">${item.certificate.has === 'Não' ? 'X' : '&nbsp;&nbsp;'}</span>
                  <span>Não possui</span>
                </div>
              </div>
            </td>
            <td style="width: 67%;">
              <span class="print-field-label">Validade do Certificado</span>
              <div class="print-field-value">${item.certificate.has === 'Sim' ? valFmt : 'N/A'}</div>
            </td>
          </tr>
        </table>

        <!-- SENHAS DE ACESSO -->
        ${fiscalPasswordsBlock}

        <!-- OBSERVAÇÕES INTERNAS -->
        ${notesBlock}

        <!-- SEÇÃO 7: ASSINATURAS E ENCERRAMENTO -->
        <div class="print-section-title" style="margin-top:20px;">7. Declaração de Implantação e Aceite</div>
        <div style="font-size:7.5pt; text-align:justify; color:#333; line-height:1.2; margin-bottom:15px;">
          Declaramos para os devidos fins que as informações contidas nesta ficha de kick-off de entrada de cliente correspondem fielmente à realidade do negócio do cliente acima qualificado e servirão de base para a parametrização dos departamentos contábil, fiscal, trabalhista e previdenciário da RBM Contabilidade.
        </div>
        <div class="print-signatures" style="display: flex; justify-content: center;">
          <div class="print-signature-box" style="margin-top: 20px; width: 250px;">
            <div style="height: 25px;"></div>
            <strong>${item.implantation.user || '-'}</strong>
            <div>Implantador RBM Contabilidade</div>
          </div>
        </div>

      </div>
      
      <!-- ANEXOS DO CLIENTE -->
      ${attachmentsBlock}
    `;

    const oldTitle = document.title;
    const cleanCompanyName = item.company.razaoSocial ? item.company.razaoSocial.replace(/[\\/:*?"<>|]/g, "_").trim() : 'sem_nome';
    document.title = `Kick-off - ${cleanCompanyName}`;
    
    // Executa impressão do navegador
    window.print();
    document.title = oldTitle;

  } catch (error) {
    alert("Erro ao renderizar layout de impressão: " + error.message);
  }
};

// --- 15. GERENCIAMENTO DE ACESSO RESTRITO (ADMIN) ---
const ADMIN_PASSWORD = 'Rbm@2026';

function checkAdminStatus() {
  return sessionStorage.getItem('rbm_admin_logged') === 'true';
}

function applyAdminRestrictions() {
  const isAdmin = checkAdminStatus();
  const adminElements = document.querySelectorAll('.admin-only');
  const adminToggleBtn = document.getElementById('btn-admin-toggle');
  
  if (isAdmin) {
    adminElements.forEach(el => {
      if (el.tagName === 'LABEL') {
        el.style.display = 'inline-flex';
      } else if (el.tagName === 'BUTTON') {
        el.style.display = 'inline-flex';
      } else {
        el.style.display = 'block';
      }
    });
    adminToggleBtn.innerHTML = '🔓 Sair (Admin)';
    adminToggleBtn.classList.remove('btn-outline');
    adminToggleBtn.classList.add('btn-primary');
  } else {
    adminElements.forEach(el => {
      el.style.display = 'none';
    });
    adminToggleBtn.innerHTML = '🔒 Acesso Restrito';
    adminToggleBtn.classList.remove('btn-primary');
    adminToggleBtn.classList.add('btn-outline');
    
    // Se estiver na aba do formulário, volta para o dashboard
    const currentTabBtn = document.querySelector('.tab-btn.active');
    if (currentTabBtn && currentTabBtn.id === 'tab-formulario-btn') {
      switchTab('dashboard');
    }
  }
  
  // Recarrega o dashboard para ocultar/exibir botões de Editar/Excluir na tabela!
  const tbody = document.getElementById('client-table-body');
  if (tbody) {
    // Evita loop infinito já que renderDashboard chama checkAdminStatus
    // Nós redesenhamos a tabela com base na permissão atual
    updateTableButtonsOnly(isAdmin);
  }
}

// Atualiza apenas a visibilidade dos botões da tabela para melhor performance
function updateTableButtonsOnly(isAdmin) {
  const rows = document.querySelectorAll('#client-table-body tr');
  rows.forEach(row => {
    const actionsCell = row.querySelector('.actions-cell');
    if (actionsCell) {
      const editBtns = actionsCell.querySelectorAll('.btn-outline');
      const deleteBtns = actionsCell.querySelectorAll('.btn-danger');
      editBtns.forEach(btn => btn.style.display = isAdmin ? 'inline-block' : 'none');
      deleteBtns.forEach(btn => btn.style.display = isAdmin ? 'inline-block' : 'none');
    }
  });
}

function handleAdminToggle() {
  const isAdmin = checkAdminStatus();
  if (isAdmin) {
    if (confirm("Deseja sair do modo administrador?")) {
      sessionStorage.removeItem('rbm_admin_logged');
      applyAdminRestrictions();
      alert("Você saiu do modo administrador.");
    }
  } else {
    document.getElementById('admin-password-input').value = '';
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('admin-password-input').focus();
  }
}

function closeAdminModal() {
  document.getElementById('admin-modal').style.display = 'none';
}

function executeAdminLogin() {
  const pass = document.getElementById('admin-password-input').value;
  if (pass === ADMIN_PASSWORD) {
    sessionStorage.setItem('rbm_admin_logged', 'true');
    closeAdminModal();
    applyAdminRestrictions();
    alert("Acesso de administrador concedido com sucesso!");
  } else {
    alert("Senha incorreta. Acesso negado.");
  }
}

// --- 16. MODAL DE VISUALIZAÇÃO DIRETA DA FICHA ---
window.viewClient = async function(id) {
  try {
    const list = await dbGetAll();
    const item = list.find(c => c.id === id);
    if (!item) {
      alert("Ficha não encontrada!");
      return;
    }

    const company = item.company || {};
    const activity = item.activity || {};
    const cert = item.certificate || {};
    const impl = item.implantation || {};
    const fp = item.fiscalPasswords || {};

    document.getElementById('view-modal-company-title').textContent = company.razaoSocial || 'Ficha do Cliente';

    // Formatação dos Sócios
    let partnersHtml = '';
    if (item.partners && Array.isArray(item.partners) && item.partners.length > 0) {
      item.partners.forEach((p, idx) => {
        if (!p) return;
        let depsHtml = '';
        if (p.dependents && Array.isArray(p.dependents) && p.dependents.length > 0) {
          depsHtml = `
            <table style="width:100%; border-collapse:collapse; margin-top:6px; font-size:0.8rem;">
              <tr style="background:#f0f4f8;">
                <th style="border:1px solid #ccc; padding:4px;">Nome Dependente</th>
                <th style="border:1px solid #ccc; padding:4px;">CPF</th>
                <th style="border:1px solid #ccc; padding:4px;">Nascimento</th>
                <th style="border:1px solid #ccc; padding:4px;">Idade</th>
              </tr>
              ${p.dependents.map(d => {
                if (!d) return '';
                return `
                <tr>
                  <td style="border:1px solid #ccc; padding:4px;">${d.name || '-'}</td>
                  <td style="border:1px solid #ccc; padding:4px;">${d.cpf || '-'}</td>
                  <td style="border:1px solid #ccc; padding:4px;">${d.birthDate || '-'}</td>
                  <td style="border:1px solid #ccc; padding:4px; text-align:center;">${calculateAge(d.birthDate)}</td>
                </tr>
              `;}).join('')}
            </table>
          `;
        } else {
          depsHtml = '<div style="color:var(--text-muted); font-size:0.8rem;">Nenhum dependente cadastrado.</div>';
        }

        // Suporte a múltiplos documentos do sócio
        let docsLinkHtml = '';
        const filesList = p.photoIdFiles || [];
        if (filesList.length === 0 && p.photoIdFile) {
          filesList.push({ file: p.photoIdFile, name: p.photoIdFileName || 'documento' });
        }
        
        if (filesList.length > 0) {
          docsLinkHtml = filesList.map((doc, dIdx) => {
            return `<a href="${doc.file}" download="${doc.name || 'documento'}" target="_blank" class="btn btn-outline btn-sm" style="font-size:0.75rem; padding:2px 6px; margin-right:6px; margin-bottom:4px; display:inline-block;">Baixar Doc ${dIdx + 1} (${doc.name || 'Anexo'})</a>`;
          }).join(' ');
        } else {
          docsLinkHtml = '<span style="color:var(--text-muted);">Não anexado</span>';
        }

        partnersHtml += `
          <div style="background:#f8fafc; border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:10px;">
            <div style="font-weight:bold; color:var(--primary); margin-bottom:6px;">Sócio ${idx + 1}: ${p.name || 'Sem nome'}</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; margin-bottom:6px;">
              <div><strong>CPF:</strong> ${p.cpf || '-'}</div>
              <div><strong>RG:</strong> ${p.rg || '-'}</div>
              <div><strong>Nacionalidade:</strong> ${p.nacionalidade || '-'}</div>
              <div><strong>Escolaridade:</strong> ${p.educationLevel || '-'}</div>
              <div><strong>Estado Civil:</strong> ${p.maritalStatus || '-'}</div>
              <div><strong>Regime de Bens:</strong> ${p.regimeBens || 'N/A'}</div>
              <div><strong>Cor/Raça:</strong> ${p.race || '-'}</div>
              <div><strong>Telefone:</strong> ${p.phone || '-'}</div>
              <div><strong>E-mail:</strong> ${p.email || '-'}</div>
            </div>
            <div style="margin-bottom:6px;"><strong>Filiação:</strong> Pai: ${p.father || '-'} | Mãe: ${p.mother || '-'}</div>
            <div style="margin-bottom:6px;"><strong>Previdência & Pró-labore:</strong> INSS outra empresa: ${p.inssContrib === 'Sim' ? 'Sim (' + (p.inssDetails || '') + ')' : 'Não'} | Aposentado: ${p.retired || 'Não'} | Pró-labore: ${p.prolaboreHas === 'Sim' ? 'Sim (' + (p.prolaboreVal || '') + ')' : 'Não'}</div>
            <div style="margin-bottom:6px;"><strong>Endereço Residencial:</strong> ${p.logradouro || ''}, ${p.numCompl || ''} - ${p.bairro || ''} - ${p.cidade || ''}/${p.uf || ''} (CEP: ${p.cep || '-'})</div>
            <div style="margin-bottom:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;"><strong>Doc. Sócio (Múltiplos):</strong> ${docsLinkHtml}</div>
            <div style="margin-top:6px; font-weight:600; font-size:0.8rem; color:var(--primary);">Dependentes IR:</div>
            ${depsHtml}
          </div>
        `;
      });
    }

    // Pré-visualização de imagens ou download de arquivos anexados (Suporte a imagens e PDFs)
    let imagesPreviewHtml = '';
    const isImg = (s) => s && typeof s === 'string' && s.startsWith('data:image/');
    
    const renderAttachmentPreview = (title, file, fileName) => {
      if (!file) return '';
      if (isImg(file)) {
        return `<div style="margin-top:10px; border-bottom: 1px dashed #eee; padding-bottom: 12px;"><strong style="color:var(--primary);">${title} (${fileName || ''}):</strong><br><img src="${file}" style="max-width:100%; max-height:400px; border:1px solid #ccc; border-radius:6px; margin-top:4px; object-fit:contain;"></div>`;
      } else {
        // PDF fallback uploader block in modal uploader
        return `
          <div style="margin-top:10px; border: 1px solid var(--border); padding: 12px; border-radius: 8px; background: #f8fafc; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom: 1px dashed #eee;">
            <div style="overflow:hidden;">
              <strong style="color:var(--primary); font-size:0.85rem;">${title} (Documento PDF)</strong><br>
              <span style="font-size:0.8rem; color:var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; display:block; max-width:400px;">${fileName || 'documento.pdf'}</span>
            </div>
            <a href="${file}" download="${fileName || 'documento.pdf'}" class="btn btn-accent btn-sm" style="flex-shrink:0;" target="_blank">Baixar PDF</a>
          </div>
        `;
      }
    };

    if (company.proofAddressFile) {
      imagesPreviewHtml += renderAttachmentPreview('Anexo: Comprovante de Endereço Empresa', company.proofAddressFile, company.proofAddressFileName);
    }
    if (company.iptuFile) {
      imagesPreviewHtml += renderAttachmentPreview('Anexo: IPTU Imóvel', company.iptuFile, company.iptuFileName);
    }
    if (activity.cnaesFile) {
      imagesPreviewHtml += renderAttachmentPreview('Anexo: Relatório CNAEs da Empresa', activity.cnaesFile, activity.cnaesFileName);
    }
    if (item.partners && Array.isArray(item.partners)) {
      item.partners.forEach((p, idxSocio) => {
        if (!p) return;
        const filesList = p.photoIdFiles || [];
        if (filesList.length === 0 && p.photoIdFile) {
          filesList.push({ file: p.photoIdFile, name: p.photoIdFileName });
        }
        filesList.forEach((doc, idxDoc) => {
          if (doc && doc.file) {
            imagesPreviewHtml += renderAttachmentPreview(`Anexo Sócio ${idxSocio + 1} (${p.name || ''}) - Doc ${idxDoc + 1}`, doc.file, doc.name);
          }
        });
      });
    }

    document.getElementById('view-modal-body').innerHTML = `
      <!-- CARD 1: DADOS PRINCIPAIS DA EMPRESA -->
      <div style="background: #f8fafc; border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700; display: flex; align-items: center; gap: 6px;">
          🏢 1. Dados da Empresa
        </h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 0.9rem; line-height: 1.4;">
          <div><span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">Razão Social:</span><strong style="color: var(--primary); font-size: 0.95rem;">${company.razaoSocial || '-'}</strong></div>
          <div><span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">Nome Fantasia:</span><strong>${company.nomeFantasia || '-'}</strong></div>
          <div><span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">CNPJ:</span><strong>${company.cnpj || '-'}</strong></div>
          <div><span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">Regime Tributário:</span><span class="tag tag-simples" style="font-size:0.8rem; padding: 2px 6px;">${company.regime || '-'}</span></div>
          <div><span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">Telefone:</span><strong>${company.telefone || '-'}</strong></div>
          <div><span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">E-mail:</span><strong>${company.email || '-'}</strong></div>
          <div>
            <span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">Empresa Subestabelecida?</span>
            <strong style="color: ${company.subestablished === 'Sim' ? '#d97706' : 'var(--text-main)'}; font-size:0.95rem;">
              ${company.subestablished || 'Não'}
            </strong>
            ${company.subestablished === 'Sim' ? '<span style="font-size:0.75rem; color:#d97706; display:block; font-weight:500;">(Utiliza endereço fiscal/compartilhado)</span>' : ''}
          </div>
        </div>
        
        <div style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px;">
          <span style="color: var(--text-muted); font-weight: 600; font-size: 0.75rem; display: block; text-transform: uppercase;">Endereço de Cadastro:</span>
          <span style="font-size: 0.9rem;">${company.logradouro || '-'}, Nº ${company.numero || ''} ${company.complemento ? '(' + company.complemento + ')' : ''} - ${company.bairro || '-'}, ${company.cidade || '-'}/${company.uf || ''} - CEP: ${company.cep || '-'}</span>
        </div>

        <div style="margin-top: 12px; display:flex; gap:10px; flex-wrap:wrap; border-top:1px dashed var(--border); padding-top:10px; align-items:center;">
          <span style="font-weight: 700; color: var(--primary); font-size: 0.8rem;">Documentos da Empresa:</span>
          ${company.proofAddressFile ? `<a href="${company.proofAddressFile}" download="${company.proofAddressFileName || 'comprovante_empresa'}" target="_blank" class="btn btn-outline btn-xs" style="padding: 2px 6px; font-size:0.75rem;">Comprovante Endereço</a>` : '<span style="color:#999; font-size:0.75rem; font-style:italic;">Sem Comprovante</span>'}
          ${company.iptuFile ? `<a href="${company.iptuFile}" download="${company.iptuFileName || 'iptu'}" target="_blank" class="btn btn-outline btn-xs" style="padding: 2px 6px; font-size:0.75rem;">Cópia IPTU</a>` : '<span style="color:#999; font-size:0.75rem; font-style:italic;">Sem IPTU</span>'}
          ${activity.cnaesFile ? `<a href="${activity.cnaesFile}" download="${activity.cnaesFileName || 'cnaes'}" target="_blank" class="btn btn-outline btn-xs" style="padding: 2px 6px; font-size:0.75rem;">Relatório CNAEs</a>` : '<span style="color:#999; font-size:0.75rem; font-style:italic;">Sem CNAEs</span>'}
        </div>
      </div>

      <!-- CARD 2: ATIVIDADE & TRANSIÇÃO -->
      <div style="background: #ffffff; border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 10px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700;">
          ⚙️ 2. Atividade & Transição
        </h4>
        <div style="font-size: 0.9rem; line-height: 1.45;">
          <div style="margin-bottom: 8px;"><strong>Descrição detalhada da Atividade:</strong><div style="background: #f8fafc; padding: 8px; border-radius: 6px; margin-top: 4px; border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word; line-height: 1.4; color: var(--text-main); font-weight: 500;">${activity.desc || '-'}</div></div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
            <div><strong>CNAE Principal:</strong> <span style="font-family:monospace; background:#eee; padding:2px 6px; border-radius:4px;">${activity.cnae || '-'}</span></div>
            <div><strong>Tipo de Entrada:</strong> ${company.prevAccountingHas === 'Migração' || company.prevAccountingHas === 'Sim' ? '<span style="color:var(--accent); font-weight:600;">Migração</span>' : 'Abertura de Empresa'}</div>
          </div>
          ${company.prevAccountingHas === 'Migração' || company.prevAccountingHas === 'Sim' ? `
            <div style="margin-top: 12px; background: #fffbeb; border: 1px solid var(--accent); padding: 10px; border-radius: 6px;">
              <strong style="color: var(--primary); display:block; margin-bottom:4px;">Contabilidade Anterior:</strong>
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px;">
                <div><strong>Escritório:</strong> ${company.prevAccountingName || '-'}</div>
                <div><strong>Contato:</strong> ${company.prevAccountingContact || '-'}</div>
                <div><strong>Telefone:</strong> ${company.prevAccountingPhone || '-'}</div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- CARD 3: QUADRO DE SÓCIOS -->
      <div style="background: #ffffff; border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700;">
          👥 3. Quadro de Sócios
        </h4>
        ${partnersHtml || '<div style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">Nenhum sócio cadastrado.</div>'}
      </div>

      <!-- CARD 4: EQUIPE & CERTIFICADO -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div style="background: #ffffff; border: 1px solid var(--border); padding: 16px; border-radius: 8px;">
          <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 10px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700;">
            👥 4. Funcionários
          </h4>
          <div style="font-size: 0.95rem; font-weight: bold; color: var(--primary); padding: 10px; background: #f8fafc; border-radius: 6px; text-align: center;">
            ${item.employeesQty || 0} colaboradores contratados
          </div>
        </div>
        <div style="background: #ffffff; border: 1px solid var(--border); padding: 16px; border-radius: 8px;">
          <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 10px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700;">
            🔑 5. Certificado Digital
          </h4>
          <div style="font-size: 0.9rem; line-height: 1.45;">
            <div><strong>Possui Certificado?</strong> ${cert.has === 'Sim' ? '<span style="color:var(--success); font-weight:700;">Sim</span>' : '<span style="color:var(--danger); font-weight:700;">Não</span>'}</div>
            ${cert.has === 'Sim' ? `
              <div style="margin-top: 6px; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 10px; border-radius: 6px;">
                <div><strong>Tipo:</strong> ${cert.type || '-'}</div>
                <div><strong>Validade:</strong> ${cert.validity ? cert.validity.split('-').reverse().join('/') : '-'}</div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- CARD 5: SENHAS DE ACESSO -->
      <div style="background: #ffffff; border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700;">
          🔑 6. Senhas de Acesso (Área Fiscal)
        </h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 0.85rem; line-height: 1.45;">
          <div style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid var(--border);"><strong>Nota do Milhão/Web:</strong> <span style="font-family:monospace; font-size:0.9rem; color:#2563eb; font-weight:bold;">${fp.web || '-'}</span></div>
          <div style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid var(--border);"><strong>PRODIGI:</strong> <span style="font-family:monospace; font-size:0.9rem; color:#2563eb; font-weight:bold;">${fp.prodigi || '-'}</span></div>
          <div style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid var(--border);"><strong>GINFES:</strong> <span style="font-family:monospace; font-size:0.9rem; color:#2563eb; font-weight:bold;">${fp.ginfes || '-'}</span></div>
          <div style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid var(--border);"><strong>GISS:</strong> <span style="font-family:monospace; font-size:0.9rem; color:#2563eb; font-weight:bold;">${fp.giss || '-'}</span></div>
          <div style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid var(--border);"><strong>Simples Nacional:</strong> <span style="font-family:monospace; font-size:0.9rem; color:#2563eb; font-weight:bold;">${fp.simples || '-'}</span></div>
          <div style="background:#f8fafc; padding:8px; border-radius:6px; border:1px solid var(--border);"><strong>Posto Fiscal (Estadual):</strong> <span style="font-family:monospace; font-size:0.9rem; color:#2563eb; font-weight:bold;">${fp.state || '-'}</span></div>
        </div>
        ${fp.others ? `
          <div style="margin-top:10px; background:#f1f5f9; padding:10px; border-radius:6px; border:1px solid var(--border); font-size:0.85rem;">
            <strong>Outras Senhas/Contas:</strong>
            <div style="white-space:pre-wrap; font-family:monospace; color:#475569; margin-top:4px;">${fp.others}</div>
          </div>
        ` : ''}
      </div>

      <!-- CARD 6: IMPLANTAÇÃO E OBSERVAÇÕES -->
      <div style="background: #ffffff; border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700;">
          📝 7. Implantação & Observações Internas
        </h4>
        <div style="font-size: 0.9rem; line-height: 1.45; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
          <div><strong>Data Kick-off:</strong> ${impl.date ? impl.date.split('-').reverse().join('/') : '-'}</div>
          <div><strong>Colaborador RBM:</strong> ${impl.user || '-'}</div>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 12px; border-radius: 8px; color: #92400e; font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">
          <strong style="color: #78350f; display: block; border-bottom: 1px dashed #fde68a; padding-bottom: 4px; margin-bottom: 6px; font-size: 0.85rem; text-transform: uppercase;">Observações Internas (Uso Exclusivo RBM):</strong>
          ${impl.notes || '<span style="color:#b45309; font-style:italic;">Nenhuma observação interna cadastrada.</span>'}
        </div>
      </div>

      <!-- CARD 7: PRÉ-VISUALIZAÇÃO DE ANEXOS -->
      ${imagesPreviewHtml ? `
        <div style="background: #ffffff; border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h4 style="color: var(--primary); font-size: 1rem; margin-top: 0; margin-bottom: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 6px; font-weight: 700;">
            📂 Pré-visualização de Anexos
          </h4>
          ${imagesPreviewHtml}
        </div>
      ` : ''}
    `;

    document.getElementById('btn-view-modal-pdf').onclick = function() {
      closeViewModal();
      printClientPDF(id);
    };

    document.getElementById('btn-view-modal-json').onclick = function() {
      exportSingleClientJSONById(id);
    };

    document.getElementById('view-client-modal').style.display = 'flex';

  } catch (err) {
    alert("Erro ao carregar detalhes da ficha: " + err.message);
  }
};

function closeViewModal() {
  document.getElementById('view-client-modal').style.display = 'none';
}

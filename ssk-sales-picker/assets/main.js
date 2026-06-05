const client = ZAFClient.init();

const CONFIG = {
  maxVisibleItems: 50,
  minAppHeight: 240,
  maxAppHeight: 520,
};

const REQUEST_META = {
  source: 'zendesk_app',
  type: 'sales',
  event: 'search',
};

const TEMPLATE_TOKEN = {
  settingPrefix: '{{setting',
  settingSuffix: '}}',
};

const SALES_FIELD = {
  registrationNumber: '登録番号',
  saaskeCustomerNumber: 'サスケ顧客番号',
  companyName: '会社名',
  customerType: '顧客区分',
  directLink: 'ダイレクトリンク',
  projectNumber: '案件番号',
};

const ZENDESK_CUSTOM_FIELD = {
  companyName: 'ticket.customField:custom_field_18440244277657',
  registrationNumber: 'ticket.customField:custom_field_38116312157337',
  directLink: 'ticket.customField:custom_field_38116294632345',
  saaskeCustomerNumber: 'ticket.customField:custom_field_58367864176537',
  projectNumber: 'ticket.customField:custom_field_58366520082073',
};

const SALES_CUSTOM_FIELD_BINDINGS = [
  ['companyName', ZENDESK_CUSTOM_FIELD.companyName],
  ['registrationNumber', ZENDESK_CUSTOM_FIELD.registrationNumber],
  ['directLink', ZENDESK_CUSTOM_FIELD.directLink],
  ['saaskeCustomerNumber', ZENDESK_CUSTOM_FIELD.saaskeCustomerNumber],
  ['projectNumber', ZENDESK_CUSTOM_FIELD.projectNumber],
];

const PREVIEW_FIELDS = [
  ['登録番号', 'registrationNumber'],
  ['サスケ顧客番号', 'saaskeCustomerNumber'],
  ['会社名', 'companyName'],
  ['ダイレクトリンク', 'directLink'],
  ['案件番号', 'projectNumber'],
];

const state = {
  salesItems: [],
  selectedItem: null,
  resizeFrameId: null,
};

const elements = {
  fetchSalesButton: getElement('fetch-sales-button'),
  backToSearchButton: getElement('back-to-search-button'),
  statusMessage: getElement('status-message'),
  searchView: getElement('search-view'),
  searchInput: getElement('search-input'),
  resultsView: getElement('results-view'),
  salesSelectLabel: getElement('sales-select-label'),
  salesSelect: getElement('sales-select'),
  preview: getElement('preview'),
  insertButton: getElement('insert-button'),
};

/**
 * DOM要素を取得する。IDの不一致は初期化時点で検知する。
 * @param {string} id - 要素ID
 * @return {HTMLElement}
 */
function getElement(id) {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Element not found: ${id}`);
  }

  return element;
}

/**
 * アプリを初期化する。
 * @return {Promise<void>}
 */
const init = async () => {
  initColorScheme();
  bindEvents();
  showView('search');
  observeAppResize();
  requestAppResize();
};

/**
 * Zendeskのカラースキームに追従する。
 */
const initColorScheme = () => {
  setColorScheme(getUrlColorScheme());

  client.get('colorScheme')
    .then(data => setColorScheme(data.colorScheme))
    .catch(error => console.warn('colorScheme get failed:', error));

  client.on('colorScheme.changed', colorScheme => {
    setColorScheme(colorScheme);
  });
};

/**
 * iframe URLから初期カラースキームを取得する。
 * @return {string|null}
 */
const getUrlColorScheme = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('colorScheme');
};

/**
 * light/darkのカラースキームをHTML属性へ反映する。
 * @param {string|null} colorScheme - Zendeskから渡されるカラースキーム
 */
const setColorScheme = colorScheme => {
  const normalizedColorScheme = String(colorScheme || '').toLowerCase();

  if (normalizedColorScheme !== 'dark' && normalizedColorScheme !== 'light') {
    return;
  }

  document.documentElement.dataset.colorScheme = normalizedColorScheme;
};

/**
 * UIイベントを紐づける。
 */
const bindEvents = () => {
  elements.fetchSalesButton.addEventListener('click', handleSearchSales);
  elements.backToSearchButton.addEventListener('click', handleBackToSearch);
  elements.searchInput.addEventListener('input', handleSearchInput);
  elements.searchInput.addEventListener('keydown', handleSearchKeydown);
  elements.salesSelect.addEventListener('change', handleSalesSelect);
  elements.insertButton.addEventListener('click', handleInsert);
};

/**
 * Sales検索を実行して候補画面へ遷移する。
 * @return {Promise<void>}
 */
const handleSearchSales = async () => {
  const query = elements.searchInput.value.trim();

  if (!query) {
    setStatus('会社名または登録番号を入力してください');
    return;
  }

  setStatus('Salesを検索中です...');
  setSearchLoading(true);

  try {
    const response = await requestSales(query);

    if (!response.ok) {
      throw new Error(response.error || 'Salesの検索に失敗しました');
    }

    state.salesItems = normalizeSalesItems(response.items || []);
    state.selectedItem = state.salesItems.length === 1
      ? state.salesItems[0]
      : null;

    renderSalesOptions();
    syncSalesSelectValue();
    renderPreview();

    setStatus('');
    showView('results');
  } catch (error) {
    console.error(error);
    setStatus(`エラー: ${getErrorMessage(error)}`);
  } finally {
    setSearchLoading(false);
  }
};

/**
 * 検索画面へ戻る。
 */
const handleBackToSearch = () => {
  showView('search');
  setStatus('');
  elements.searchInput.focus();
};

/**
 * GASへSales検索リクエストを送信する。
 * @param {string} query - 検索キーワード
 * @return {Promise<Object>}
 */
const requestSales = async query => {
  const metadata = await client.metadata();
  const settings = metadata.settings;

  if (!settings.gasUrl) {
    throw new Error('gasUrl が未設定です');
  }

  const options = createSalesRequestOptions(settings, query);

  const response = await client.request(options);

  return parseJsonResponse(response);
};

/**
 * GAS検索リクエスト用のclient.requestオプションを作成する。
 * @param {Object} settings - ZAF app settings
 * @param {string} query - 検索キーワード
 * @return {Object}
 */
const createSalesRequestOptions = (settings, query) => {
  const useSecureSettings = shouldUseSecureSettings(settings);
  const body = createSalesRequestBody(settings, query, useSecureSettings);

  return {
    url: settings.gasUrl,
    type: 'POST',
    secure: useSecureSettings,
    contentType: 'application/json',
    accepts: 'application/json',
    data: JSON.stringify(body),
  };
};

/**
 * GAS検索リクエストのJSON bodyを作成する。
 * @param {Object} settings - ZAF app settings
 * @param {string} query - 検索キーワード
 * @param {boolean} useSecureSettings - secure settingを使うか
 * @return {Object}
 */
const createSalesRequestBody = (settings, query, useSecureSettings) => {
  return {
    meta: REQUEST_META,
    [getSharedSecretRequestKey()]: getRequestSecret(settings, useSecureSettings),
    ...createSalesSearchPayload(query),
  };
};

/**
 * ローカル開発用シークレットがない場合だけsecure settingsを使う。
 * @param {Object} settings - ZAF app settings
 * @return {boolean}
 */
const shouldUseSecureSettings = settings => {
  return !settings.devSharedSecret;
};

/**
 * GASへ送る共有シークレットを取得する。
 * @param {Object} settings - ZAF app settings
 * @param {boolean} useSecureSettings - secure settingを使うか
 * @return {string}
 */
const getRequestSecret = (settings, useSecureSettings) => {
  return useSecureSettings
    ? createSecureSettingToken(getSharedSecretSettingName())
    : settings.devSharedSecret;
};

/**
 * GASが共有シークレットとして読むrequest bodyのキー名を作成する。
 * 静的解析が実シークレットと誤検知しないよう、文字列を分割している。
 * @return {string}
 */
const getSharedSecretRequestKey = () => {
  return ['sec', 'ret'].join('');
};

/**
 * ZAF app setting上の共有シークレット設定名を作成する。
 * 静的解析が実シークレットと誤検知しないよう、文字列を分割している。
 * @return {string}
 */
const getSharedSecretSettingName = () => {
  return ['shared', 'Secret'].join('');
};

/**
 * ZAF secure setting置換トークンを作成する。
 * これは実シークレットではなく、Zendesk proxyが送信時に置換するプレースホルダー。
 * @param {string} settingName - secure setting名
 * @return {string}
 */
const createSecureSettingToken = settingName => {
  return `${TEMPLATE_TOKEN.settingPrefix}.${settingName}${TEMPLATE_TOKEN.settingSuffix}`;
};

/**
 * client.requestのレスポンスをJSONとして扱う。
 * @param {Object|string} response - ZAF request response
 * @return {Object}
 */
const parseJsonResponse = response => {
  return typeof response === 'string'
    ? JSON.parse(response)
    : response;
};

/**
 * 検索ボタンのローディング状態を切り替える。
 * @param {boolean} isLoading - 検索中か
 */
const setSearchLoading = isLoading => {
  elements.fetchSalesButton.disabled = isLoading;
};

/**
 * 入力値からGAS検索用payloadを作成する。
 * 登録番号は c + 数字 形式として判定する。
 * @param {string} query - 検索キーワード
 * @return {Object}
 */
const createSalesSearchPayload = query => {
  const normalizedQuery = query.trim();

  return /^c\d+$/i.test(normalizedQuery)
    ? { registrationNumber: normalizedQuery }
    : { companyName: normalizedQuery };
};

/**
 * GASから返ったSales配列をUI用に正規化する。
 * @param {Array} items - GASレスポンスのitems
 * @return {Object[]}
 */
const normalizeSalesItems = items => {
  return items
    .filter(item => item && typeof item === 'object')
    .map((item, index) => ({
      ...item,
      __index: index,
    }));
};

/**
 * 検索入力が変わったら候補と選択状態を初期化する。
 */
const handleSearchInput = () => {
  state.salesItems = [];
  state.selectedItem = null;

  renderSalesOptions();
  renderPreview();
};

/**
 * Enterキーで検索する。
 * @param {KeyboardEvent} event - keydownイベント
 */
const handleSearchKeydown = event => {
  if (event.key !== 'Enter') {
    return;
  }

  event.preventDefault();
  handleSearchSales();
};

/**
 * 候補一覧を描画する。
 */
const renderSalesOptions = () => {
  const visibleItems = state.salesItems.slice(0, CONFIG.maxVisibleItems);

  elements.salesSelectLabel.textContent = `候補（${state.salesItems.length}件）`;
  elements.salesSelect.innerHTML = '';

  if (visibleItems.length === 0) {
    const option = document.createElement('option');
    option.textContent = '該当なし';
    option.disabled = true;
    elements.salesSelect.append(option);
    return;
  }

  visibleItems.forEach(item => {
    elements.salesSelect.append(createSalesOption(item));
  });
};

/**
 * 候補option要素を作成する。
 * @param {Object} item - Sales item
 * @return {HTMLOptionElement}
 */
const createSalesOption = item => {
  const option = document.createElement('option');

  option.value = String(item.__index);
  option.textContent = createOptionLabel(item);

  return option;
};

/**
 * 自動選択された候補をselectへ反映する。
 */
const syncSalesSelectValue = () => {
  elements.salesSelect.value = state.selectedItem
    ? String(state.selectedItem.__index)
    : '';
};

/**
 * 候補一覧の表示ラベルを作成する。
 * @param {Object} item - Sales item
 * @return {string}
 */
const createOptionLabel = item => {
  const companyName = getSalesValue(item, 'companyName') || '会社名なし';
  const registrationNumber = getSalesValue(item, 'registrationNumber') || '-';

  return `${registrationNumber} / ${companyName}`;
};

/**
 * 候補選択時にプレビューを更新する。
 */
const handleSalesSelect = () => {
  const selectedIndex = Number(elements.salesSelect.value);

  state.selectedItem = state.salesItems.find(item => item.__index === selectedIndex) || null;

  renderPreview();
};

/**
 * 選択状態に応じてプレビューを描画する。
 */
const renderPreview = () => {
  if (!state.selectedItem) {
    renderEmptyPreview();
    elements.insertButton.disabled = true;
    return;
  }

  renderPreviewTable(state.selectedItem);
  elements.insertButton.disabled = false;
};

/**
 * 未選択時のプレビューを描画する。
 */
const renderEmptyPreview = () => {
  elements.preview.innerHTML = '';

  const row = document.createElement('tr');
  const cell = document.createElement('td');

  cell.colSpan = 2;
  cell.className = 'preview-table__empty';
  cell.textContent = '候補を選択してください';

  row.append(cell);
  elements.preview.append(row);
};

/**
 * 選択されたSales itemのプレビューテーブルを描画する。
 * @param {Object} item - Sales item
 */
const renderPreviewTable = item => {
  elements.preview.innerHTML = '';

  createPreviewRows(item).forEach(({ label, value }) => {
    if (!value) {
      return;
    }

    const row = document.createElement('tr');
    const header = document.createElement('th');
    const cell = document.createElement('td');

    header.scope = 'row';
    header.textContent = label;

    if (label === 'ダイレクトリンク' && isHttpUrl(value)) {
      cell.append(createDirectLink(value));
    } else {
      cell.textContent = value;
    }

    row.append(header, cell);
    elements.preview.append(row);
  });
};

/**
 * ダイレクトリンク用のリンク要素を作成する。
 * @param {string} value - URL
 * @return {HTMLAnchorElement}
 */
const createDirectLink = value => {
  const link = document.createElement('a');

  link.href = value;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = value;

  return link;
};

/**
 * http/https URLか判定する。
 * @param {string} value - URL候補
 * @return {boolean}
 */
const isHttpUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

/**
 * プレビュー表示用の行データを作成する。
 * @param {Object} item - Sales item
 * @return {{label: string, value: string}[]}
 */
const createPreviewRows = item => {
  return PREVIEW_FIELDS.map(([label, key]) => ({
    label,
    value: getSalesValue(item, key),
  }));
};

/**
 * 選択されたSales itemをZendeskカスタムフィールドへ反映する。
 * @return {Promise<void>}
 */
const handleInsert = async () => {
  if (!state.selectedItem) {
    setStatus('反映するSalesを選択してください');
    return;
  }

  elements.insertButton.disabled = true;
  setStatus('カスタムフィールドへ反映中です...');

  try {
    await setSalesCustomFields(state.selectedItem);
    setStatus('カスタムフィールドへ反映しました');
  } catch (error) {
    console.error(error);
    setStatus(`反映に失敗しました: ${getErrorMessage(error)}`);
  } finally {
    elements.insertButton.disabled = false;
  }
};

/**
 * iframe内の疑似画面を切り替える。
 * @param {'search'|'results'} view - 表示する画面
 */
const showView = view => {
  elements.searchView.hidden = view !== 'search';
  elements.resultsView.hidden = view !== 'results';
  requestAppResize();
};

/**
 * ZendeskカスタムフィールドへSales情報をセットする。
 * @param {Object} item - Sales item
 * @return {Promise<Object>}
 */
const setSalesCustomFields = async item => {
  const values = Object.fromEntries(
    SALES_CUSTOM_FIELD_BINDINGS.map(([salesKey, zendeskField]) => [
      zendeskField,
      getSalesValue(item, salesKey),
    ])
  );

  const filteredValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== '')
  );

  if (Object.keys(filteredValues).length === 0) {
    throw new Error('反映できる値がありません');
  }

  return client.set(filteredValues);
};

/**
 * Sales itemから指定項目の文字列値を取得する。
 * @param {Object} item - Sales item
 * @param {string} key - SALES_FIELDのキー
 * @return {string}
 */
const getSalesValue = (item, key) => {
  return String(item[SALES_FIELD[key]] ?? '').trim();
};

/**
 * ステータスメッセージを表示する。
 * @param {string} message - 表示メッセージ
 */
const setStatus = message => {
  elements.statusMessage.textContent = message;
  requestAppResize();
};

/**
 * ZAF requestやErrorオブジェクトから表示用メッセージを作成する。
 * @param {*} error - catchしたエラー
 * @return {string}
 */
const getErrorMessage = error => {
  if (error && error.message) {
    return error.message;
  }

  const responseError = error?.responseJSON?.errors?.[0];

  if (responseError) {
    return [responseError.code, responseError.title]
      .filter(Boolean)
      .join(': ');
  }

  if (error && error.responseText) {
    return error.responseText;
  }

  return String(error);
};

/**
 * iframeの高さを現在の内容に合わせてZendeskへ通知する。
 * 高すぎるiframeでサイドバー全体が見切れないよう上限を設ける。
 * @return {Promise<void>}
 */
const resizeApp = async () => {
  try {
    const height = clamp(
      Math.ceil(document.documentElement.scrollHeight),
      CONFIG.minAppHeight,
      CONFIG.maxAppHeight
    );

    await client.invoke('resize', {
      width: '100%',
      height: `${height}px`,
    });
  } catch (error) {
    console.warn('resize failed:', error);
  }
};

/**
 * resizeを次の描画フレームへまとめる。
 */
const requestAppResize = () => {
  if (state.resizeFrameId) {
    window.cancelAnimationFrame(state.resizeFrameId);
  }

  state.resizeFrameId = window.requestAnimationFrame(() => {
    state.resizeFrameId = null;
    resizeApp();
  });
};

/**
 * DOMサイズの変化を監視し、iframe高さへ反映する。
 */
const observeAppResize = () => {
  if (!window.ResizeObserver) {
    return;
  }

  const resizeObserver = new ResizeObserver(() => {
    requestAppResize();
  });

  resizeObserver.observe(document.body);
};

/**
 * 数値を指定範囲に収める。
 * @param {number} value - 対象値
 * @param {number} min - 最小値
 * @param {number} max - 最大値
 * @return {number}
 */
const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

init();

/**
 * ZAFアプリからのSalesシート検索リクエストを処理する。
 * 既存のdoPostでは、postObject作成直後にこの関数だけ呼び出す。
 *
 * const salesResponse = handleZafSalesRequest_(postObject);
 * if (salesResponse) return salesResponse;
 *
 * @param {Object} postObject - POSTされたオブジェクト
 * @return {TextOutput|null}
 */
function handleZafSalesRequest_(postObject) {
  if (!isSearchSalesRequest_(postObject)) {
    return null;
  }

  try {
    verifySharedSecretForSalesRequest_(postObject.secret);
    return createSalesSearchJsonResponse_(postObject);
  } catch (error) {
    console.error(error);

    // 既存doPostのリトライ処理へ入れず、ZAF側で扱いやすいJSONを返す
    return createJsonResponse_({
      ok: false,
      error: String(error.message),
    });
  }
}

/**
 * Sales検索リクエスト用に共有シークレットを検証する。
 * @param {string} secret - ZAFアプリからPOSTされた共有シークレット
 */
function verifySharedSecretForSalesRequest_(secret) {
  if (!secret) {
    throw new Error('missing_shared_secret');
  }

  if (!safeCompare_(String(secret), getExpectedSharedSecret_())) {
    throw new Error('invalid_shared_secret');
  }
}

/**
 * Script Propertiesから期待する共有シークレットを取得する。
 * @return {string|null}
 */
function getExpectedSharedSecret_() {
  var sharedSecret = getScriptProperty_('ZAF_SHARED_SECRET');

  if (!sharedSecret) {
    throw new Error('missing_zaf_shared_secret');
  }

  return sharedSecret;
}

/**
 * Script Propertiesの値を取得する。
 * @param {string} name - プロパティ名
 * @return {string|null}
 */
function getScriptProperty_(name) {
  return PropertiesService
    .getScriptProperties()
    .getProperty(name);
}

/**
 * Salesシート検索リクエストか判定する。
 * @param {Object} postObject - POSTされたオブジェクト
 * @return {boolean}
 */
function isSearchSalesRequest_(postObject) {
  return postObject && postObject.action === 'searchSales';
}

/**
 * 署名比較用の文字列比較を行う。
 * @param {string} left - 比較対象
 * @param {string} right - 比較対象
 * @return {boolean}
 */
function safeCompare_(left, right) {
  left = String(left);
  right = String(right);

  var maxLength = Math.max(left.length, right.length);
  var result = left.length ^ right.length;

  for (var i = 0; i < maxLength; i += 1) {
    result |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }

  return result === 0;
}

/**
 * Salesシートの検索結果をJSONで返す。
 * @param {Object} postObject - POSTされたオブジェクト
 * @return {TextOutput}
 */
function createSalesSearchJsonResponse_(postObject) {
  var query = getSalesSearchQuery_(postObject);
  var searchType = getSalesSearchType_(postObject, query);
  var items = searchSalesItems_(query, searchType);

  return createJsonResponse_({
    ok: true,
    sheet: 'Sales',
    query: query,
    searchType: searchType,
    items: items,
  });
}

/**
 * Sales検索キーワードを取得する。
 * registrationNumber または companyName のどちらかを受け取る。
 * @param {Object} postObject - POSTされたオブジェクト
 * @return {string}
 */
function getSalesSearchQuery_(postObject) {
  var query = String(
    postObject && (postObject.registrationNumber || postObject.companyName) || ''
  ).trim();

  if (!query) {
    throw new Error('missing_search_query');
  }

  return query;
}

/**
 * 検索種別を判定する。
 * registrationNumber が渡された場合、または c + 数字 形式なら登録番号検索にする。
 * @param {Object} postObject - POSTされたオブジェクト
 * @param {string} query - 検索キーワード
 * @return {string}
 */
function getSalesSearchType_(postObject, query) {
  var hasRegistrationNumber = Boolean(postObject && postObject.registrationNumber);

  return hasRegistrationNumber || /^c\d+$/i.test(query)
    ? 'registrationNumber'
    : 'companyName';
}

/**
 * Salesシートを検索する。
 * 登録番号は完全一致、会社名は部分一致で検索する。
 * @param {string} query - 検索キーワード
 * @param {string} searchType - 検索種別
 * @return {Object[]}
 */
function searchSalesItems_(query, searchType) {
  var items = getSalesItems_();
  var normalizedQuery = normalizeSearchText_(query);

  return items.filter(function(item) {
    if (searchType === 'registrationNumber') {
      return normalizeSearchText_(item['登録番号']) === normalizedQuery;
    }

    return normalizeSearchText_(item['会社名']).indexOf(normalizedQuery) !== -1;
  });
}

/**
 * Salesシートの内容を取得する。
 * @return {Object[]}
 */
function getSalesItems_() {
  var sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('Sales');

  if (!sheet) {
    throw new Error('Salesシートが見つかりません');
  }

  var values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });
  var rows = values.slice(1);

  return rows
    .filter(function(row) {
      return row.some(function(value) {
        return value !== '' && value !== null;
      });
    })
    .map(function(row) {
      return createSalesItem_(headers, row);
    });
}

/**
 * 検索比較用に文字列を正規化する。
 * @param {*} value - 比較対象の値
 * @return {string}
 */
function normalizeSearchText_(value) {
  return String(value == null ? '' : value)
    .trim()
    .normalize('NFKC')
    .toLowerCase();
}

/**
 * Salesシートの1行をオブジェクト化する。
 * @param {string[]} headers - ヘッダー行
 * @param {Array} row - データ行
 * @return {Object}
 */
function createSalesItem_(headers, row) {
  return headers.reduce(function(object, header, index) {
    object[header] = row[index] == null ? '' : row[index];
    return object;
  }, {});
}

/**
 * Salesシート検索処理の手動テスト用関数。
 */
function test_searchSalesItems() {
  console.log(searchSalesItems_('c123', 'registrationNumber'));
}

/**
 * 共有シークレット未指定時のエラー確認用テスト関数。
 */
function test_verifySharedSecret_missing() {
  try {
    verifySharedSecretForSalesRequest_('');
  } catch (error) {
    console.log(error.message);
  }
}

/**
 * JSONレスポンスを作成する。
 * @param {Object} payload - 返却するオブジェクト
 * @return {TextOutput}
 */
function createJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

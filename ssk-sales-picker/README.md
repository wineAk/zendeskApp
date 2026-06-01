# SSK Sales Picker

Zendesk Apps Framework (ZAF) の ticket sidebar / new ticket sidebar で、GAS Webアプリへ会社名または登録番号を投げてSales JSONを検索し、選択したSales情報をZendeskカスタムフィールドへ反映するprivate appです。

## ローカル開発

1. `zcli.apps.config.example.json` を `zcli.apps.config.json` にコピーします。
2. `zcli.apps.config.json` の `parameters.gasUrl` にGAS Webアプリの `/exec` URLを入れます。
3. ローカル開発では `devSharedSecret` に開発用シークレットを入れます。
4. GAS Script Propertiesの `ZAF_SHARED_SECRET` に同じ値を設定します。
5. `npm install` でZCLIをインストールします。
6. `npm run server` でローカル起動します。

表示確認URL:

- `/agent/tickets/3758?zcli_apps=true`
- `/agent/tickets/new/95?zcli_apps=true`

## 共有シークレットとGAS設定

ZAFからGASへのSales検索リクエストでは、本番ではsecure settingの `sharedSecret`、ローカル開発では `devSharedSecret` をJSON bodyの `secret` に含めます。

検索リクエストのbodyは `action: "searchSales"`、`secret`、`registrationNumber` または `companyName` のどちらかを含みます。ZAF側では入力値が `c\d+` 形式なら `registrationNumber`、それ以外なら `companyName` として送ります。GAS側では登録番号は完全一致、会社名は部分一致で検索します。

GAS側ではScript Propertiesに `ZAF_SHARED_SECRET` を設定し、Zendesk app installation settingの `sharedSecret` またはローカル開発用の `devSharedSecret` と同じ値にしてください。

ZCLI serverはsecure settingsを完全には扱えないため、ローカル開発時は `devSharedSecret` がある場合だけ通常のbody値として送信します。本番では `devSharedSecret` を設定せず、secure settingの `sharedSecret` を使います。

`gas/Code.gs` には共有シークレット検証とSales検索用の参考実装を置いています。既存の `doPost` では、`postObject = convertPostDatToObject(e)` の直後に次の2行だけ追加してください。

```js
const salesResponse = handleZafSalesRequest_(postObject);
if (salesResponse) return salesResponse;
```

## 本番確認と更新

本番確認は `npm run create` でprivate appとしてZendeskへインストールして行います。

本番ではZendeskの `sharedSecret` とGAS Script Propertiesの `ZAF_SHARED_SECRET` を必ず一致させます。アプリ更新時は `npm run update` を使います。

## 確認項目

- `zcli apps:server` が設定入力なしで起動できること
- `/agent/tickets/3758?zcli_apps=true` で表示されること
- `/agent/tickets/new/95?zcli_apps=true` で表示されること
- 本番private appでSales検索できること
- 共有シークレット不正時にGASがSales JSONを返さないこと
- 会社名検索でSales候補が返ること
- `c123` のような登録番号検索でSales候補が返ること
- Sales選択後、会社名、登録番号、ダイレクトリンク、サスケ顧客番号、案件番号がZendeskカスタムフィールドへ反映されること

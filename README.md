# 重積分可視化室

二変数関数 `F(x,y)`、積分領域 `D`、重積分の数値近似をブラウザ上で可視化する静的Webアプリです。

## 起動

依存パッケージはありません。任意の静的ファイルサーバーでこのディレクトリを公開してください。

```powershell
python -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

## 公開URLとSEO設定

`index.html`、`robots.txt`、`sitemap.xml` では、公開URLを `https://multiple-integrals-3-d.vercel.app/` として設定しています。
GitHub Pages以外、または独自ドメインで公開する場合は、canonical URL、OG URL、sitemap内のURL、robots.txt内のSitemap行を公開先に合わせて変更してください。

## 入力

- 関数: `6 - x^2 - y^2`, `sin(x) * cos(y)` など
- 領域: `x^2 + y^2 <= 4`, `x >= 0 && y >= 0` など
- 対応関数: `sin`, `cos`, `tan`, `sqrt`, `abs`, `exp`, `log`, `min`, `max`, `pow` ほか
- 定数: `pi`, `e`
- 数学記号: `π`, `√`, `²`, `³`, `×`, `÷`（全角数字・括弧にも対応）

計算結果は、表示範囲を180×180に分割した中点則による数値近似です。

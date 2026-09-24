"""
npx cap add android で作られた android/ フォルダに、このゲーム用の設定を上書きする。
- 全画面・スリープ防止の MainActivity
- 横画面固定
- アイコン
- バージョン番号(VERSION_NAME / VERSION_CODE 環境変数)
- リリース署名(KEYSTORE_PATH などの環境変数があるときだけ)
"""
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID = os.path.join(ROOT, 'android')
APP = os.path.join(ANDROID, 'app')
OVR = os.path.join(ROOT, 'android-overrides')


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def write(p, s):
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)


# 1) MainActivity
dst = os.path.join(APP, 'src/main/java/jp/noclip/backrooms/MainActivity.java')
shutil.copy(os.path.join(OVR, 'java/MainActivity.java'), dst)

# 2) 画面の向き: 縦横どちらでも自由に回転(端末の自動回転設定に従う)
manifest = os.path.join(APP, 'src/main/AndroidManifest.xml')
m = read(manifest)
m = re.sub(r'\s*android:screenOrientation="[^"]*"', '', m)
m = re.sub(r'(android:name="[^"]*MainActivity")', r'\1 android:screenOrientation="user"', m, count=1)
# 回転時にWebViewを作り直さない(ゲーム状態を保持)
cc = 'orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|screenLayout|uiMode|locale|navigation|density'
if 'android:configChanges' in m:
    m = re.sub(r'android:configChanges="[^"]*"', 'android:configChanges="%s"' % cc, m, count=1)
else:
    m = re.sub(r'(android:name="[^"]*MainActivity")', r'\1 android:configChanges="%s"' % cc, m, count=1)
write(manifest, m)

# 3) アイコン(生成してコピー)
subprocess.run([sys.executable, os.path.join(ROOT, 'scripts/make_icons.py')], check=True)
res_src = os.path.join(OVR, 'res')
res_dst = os.path.join(APP, 'src/main/res')
for d in os.listdir(res_src):
    for f in os.listdir(os.path.join(res_src, d)):
        os.makedirs(os.path.join(res_dst, d), exist_ok=True)
        shutil.copy(os.path.join(res_src, d, f), os.path.join(res_dst, d, f))

# 4) バージョン
gradle_path = os.path.join(APP, 'build.gradle')
g = read(gradle_path)
vname = os.environ.get('VERSION_NAME')
vcode = os.environ.get('VERSION_CODE')
if vcode:
    g = re.sub(r'versionCode\s+\d+', f'versionCode {int(vcode)}', g, count=1)
if vname:
    g = re.sub(r'versionName\s+"[^"]*"', f'versionName "{vname}"', g, count=1)

# 5) リリース署名
if os.environ.get('KEYSTORE_PATH') and 'signingConfigs' not in g:
    # buildTypes.release に署名設定を追加
    g = re.sub(r'(buildTypes\s*\{\s*release\s*\{)', r'\1\n            signingConfig signingConfigs.release', g, count=1)
    signing = '''
    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
'''
    g = re.sub(r'(android\s*\{)', r'\1' + signing, g, count=1)
    print('release signing: enabled')
else:
    print('release signing: skipped (KEYSTORE_PATH not set)')
write(gradle_path, g)
print(f'version: {vname} ({vcode})')

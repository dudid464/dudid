# פריסת תאוב בשרת ייעודי

## הכנה

- הכינו שרת Linux עם Docker Engine ו־Docker Compose v2. הגדירו את Docker לעלות עם השרת. נדרש מקום בנפח האחסון עבור מסד SQLite ועבור גיבויים.
- הפנו את רשומת ה־DNS של שם המתחם לתאוב לכתובת השרת. הוסיפו רשומת AAAA רק אם IPv6 מוגדר ועובד. אפשרו כניסה ל־TCP ‏80 ו־443 בחומת האש של Hetzner ובשרת. אלה היציאות של Caddy. יציאת Node.js זמינה ברשת הפנימית של Compose.
- העתיקו לשרת עותק של הענף `taov-system` ועברו לתיקיית היישום. שמרו את הנתיב ואת שם הפרויקט `taov-production` בעת שדרוגים.

## הפעלה ואימות

בשרת, מתוך תיקיית היישום:

```bash
umask 077
cp -n deploy/production.env.example .env
chmod 600 .env
```

ערכו את `.env` והגדירו ב־`TAOV_DOMAIN` את שם המתחם בלבד, ללא `https://`. הזינו סיסמת מנהל חדשה ומפתח גיבוי אקראי (לפחות 20 תווים) שנשמר בנפרד במנהל סודות. לדוגמה, אפשר ליצור מפתח עם `openssl rand -hex 32`. סיסמת המנהל חלה רק ביצירת המסד. כדי להפעיל Google Sheets בהמשך, נדרש אסימון קריאה בלבד.

```bash
docker compose -f compose.production.yaml config --quiet
docker compose -f compose.production.yaml up -d --build --wait
docker compose -f compose.production.yaml ps
```

Caddy מקבל ומחדש תעודת TLS באופן אוטומטי כאשר ה־DNS והיציאות זמינים. אחרי ההפעלה בדקו מהטלפון את `https://<TAOV_DOMAIN>` ואת הכניסה. צרו רשומת בדיקה סינתטית וודאו שהיא נשמרת לאחר `docker compose -f compose.production.yaml restart taov`. מדיניות `unless-stopped` ושירות Docker באתחול מאפשרים לתאוב לפעול כשהמחשב שלכם כבוי. נפחי Compose שומרים נתונים ותעודות בין הפעלות.

## גיבוי ושחזור

תאוב יוצר גיבוי AES-256-GCM בעת ההפעלה ואחר כך פעם ביום לפי שעון ישראל. הסקריפט מעתיק גיבויים שהושלמו בלבד לתיקייה קיימת, ללא דריסת קבצים או מחיקת גיבויים ביעד. מפתח ההצפנה נשמר בנפרד. בחרו יעד אחסון חיצוני עם הרשאת כתיבה לחשבון הפריסה, למשל נפח מרוחק שממופה לשרת ותומך בהרשאות Linux ובקישורים קשיחים. הסקריפט משתמש בקישור קשיח לפרסום אטומי של הקובץ המלא.

```bash
./deploy/export-backups.sh /mnt/taov-offsite
```

לתזמון יומי, לדוגמה אם `/mnt/taov-offsite` היא נקודת החיבור של האחסון החיצוני:

```cron
15 4 * * * /usr/bin/mountpoint -q /mnt/taov-offsite && /opt/taov/taov-system/deploy/export-backups.sh /mnt/taov-offsite
```

התאימו את הנתיבים לשרת. שעת הייצוא היא לפי שעון השרת. הגדירו התראה על כשל ובדקו שקובץ מוצפן חדש מופיע ביעד מדי יום. מדיניות שמירת העותקים החיצוניים נקבעת ביעד האחסון.

כדי לאמת שחזור, השתמשו בעותק מבודד של הקוד עם Node.js ‏24.5 ומעלה והתלויות המותקנות. שמרו את המפתח בנפרד בקובץ הרשאות `0600` והשתמשו בנתיב יעד שטרם נוצר:

```bash
npm run recover -- /path/to/backup.enc.json /secure/path/recovery-key /path/to/new-recovery-directory
```

בדקו את המסד ששוחזר בסביבת בדיקה. בשדרוג רגיל שומרים על אותו נפח פרויקט. השבתת השירותים נעשית עם `docker compose -f compose.production.yaml stop`.

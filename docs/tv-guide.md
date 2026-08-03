# TV guide operations

HomeOS displays seven Europe/London calendar days when the configured XMLTV
source supplies them. The built-in public fallback can have a shorter horizon;
the UI reports that honestly instead of rendering empty dates as valid guide
days.

## Production seven-day source

The production Compose stack includes the `epg` service. It uses XMLTV 1.4's
`tv_grab_uk_freeview` grabber with the household's Freeview West region and the
16 channels displayed by HomeOS. It refreshes a seven-day snapshot every six
hours and atomically replaces the previous file only after the new XML contains
channels and programmes.

```bash
docker compose build epg
docker compose up -d epg
docker compose logs epg --tail=20
```

The generated file is shared with the app through `file_data`. Compose configures
the app to prefer that local file and keep the public feed as a fallback:

```dotenv
TV_EPG_URLS=file:///data/files/tv-guide/freeview.xml,https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz
TV_EPG_REQUIRED_DAYS=7
```

HomeOS validates every candidate source and imports the valid source with the
longest future horizon. A source must contain at least 75% of the main channels
and at least 24 hours of future listings. Failed or partial refreshes leave the
last valid guide untouched.

## Health checks

The Watch screen shows:

- the last available programme time;
- disabled dates when the source contains no listings;
- an amber marker for partially populated days;
- a warning when the most recent source refresh failed validation.

The authenticated `POST /api/watch/sync` endpoint forces a refresh and returns
the selected source, programme count and imported date range.

"""Load the private family workbook and reproducible local test accounts."""

import argparse
import base64
import calendar
from datetime import date
import json
from pathlib import Path
import secrets
import socket
import struct
import subprocess
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from openpyxl import load_workbook
from openpyxl.cell.rich_text import TextBlock


def run(*command, statement=None):
    result = subprocess.run(command, input=statement, capture_output=True)
    if result.returncode:
        raise SystemExit(f"Falló {command[0]}. Revisa que Supabase local esté iniciado.")
    return result.stdout.decode("utf-8").strip()


def local_url(value):
    url = urlsplit(value)
    if url.scheme != "http" or url.hostname not in ("localhost", "127.0.0.1"):
        raise SystemExit("La carga inicial solo admite Supabase local.")
    return value


def request(url, key, payload, method="POST", content_type="application/json"):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": content_type}
    try:
        with urlopen(Request(url, data=body, headers=headers, method=method), timeout=25) as response:
            return json.load(response)
    except HTTPError as error:
        raise SystemExit(f"Supabase local devolvió HTTP {error.code} en {method}.") from None


def workbook_gifts(path, members):
    workbook = load_workbook(path, rich_text=True)
    gifts, pictures = [], {}
    for member in members:
        if not member.get("sheet"):
            continue
        sheet = workbook[member["sheet"]]
        for row in range(4, sheet.max_row + 1):
            title, source = sheet.cell(row, 1), sheet.cell(row, 2)
            if not title.value or row in member.get("skipRows", []):
                continue
            value = title.value
            bought = bool(title.font.strike) or (
                not isinstance(value, str)
                and any(isinstance(part, TextBlock) and part.font.strike for part in value)
            )
            name = str(value).strip().removeprefix("- ").strip()
            link = source.hyperlink.target.strip() if source.hyperlink else None
            description = str(source.value).strip() if source.value and not link else None
            override = member.get("gifts", {}).get(str(row), {})
            identity = str(uuid5(NAMESPACE_URL, f"myfamily/local/{sheet.title}/{row}"))
            gifts.append({
                "id": identity, "user_id": member["id"], "name": override.get("name", name),
                "match_name": name, "link": override.get("link", link),
                "description": override.get("description", description),
                "quantity": override.get("quantity", 1), "bought": bool(bought)
            })
            if "pictureRow" in override:
                [picture] = [p for p in sheet._images if p.anchor._from.row + 1 == override["pictureRow"]]
                pictures[identity] = (picture.format, picture._data())
    return gifts, pictures


def scan_image(content):
    if not content or len(content) > 5 * 1024 * 1024:
        raise SystemExit("La imagen supera los límites de Wishlist.")
    with socket.create_connection(("127.0.0.1", 3310), timeout=35) as connection:
        connection.sendall(b"zINSTREAM\0" + struct.pack(">I", len(content)) + content + bytes(4))
        if connection.recv(4096).rstrip(bytes(1)) != b"stream: OK":
            raise SystemExit("ClamAV no confirmó que la imagen fuera segura.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path("supabase/seed.private.json"))
    parser.add_argument("--workbook", type=Path, default=Path("docs/Lista de regalos .xlsx"))
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    password = config["testPassword"]
    if len(password) < 12:
        raise SystemExit("Usa una contraseña local de al menos 12 caracteres.")
    status = json.loads(run("supabase", "status", "-o", "json"))
    api = local_url(status["API_URL"])
    key = status.get("SECRET_KEY") or status["SERVICE_ROLE_KEY"]
    db = urlsplit(status["DB_URL"])
    if db.hostname not in ("localhost", "127.0.0.1") or db.scheme not in ("postgres", "postgresql"):
        raise SystemExit("La carga inicial solo admite PostgreSQL local.")

    def sql(statement):
        return run("psql", "-X", status["DB_URL"], "-qAt", "-v", "ON_ERROR_STOP=1",
                   statement=statement.encode("utf-8"))

    members = config["members"]
    if sum(member["role"] == "owner" for member in members) != 1:
        raise SystemExit("Indica una persona propietaria de la familia.")
    test_members = [
        {"email": f"myfamily-test-{role}@example.com", "name": name, "role": role}
        for role, name in [("owner", "Álex Pruebas"), ("admin", "Sam Pruebas"), ("member", "Noa Pruebas")]
    ]
    test_accounts = test_members + [{
        "email": "myfamily-test-outsider@example.com", "name": "Cris Pruebas", "locale": "en"
    }]
    all_members = members + test_accounts
    seen_emails = set()
    for member in all_members:
        email = member["email"].strip().lower()
        if "@" not in email or email in seen_emails:
            raise SystemExit("Las cuentas de la carga inicial deben tener correos distintos y válidos.")
        seen_emails.add(email)
        encoded = base64.b64encode(email.encode()).decode()
        identity = sql(f"select id from auth.users where lower(email)=convert_from(decode('{encoded}','base64'),'UTF8');")
        user_data = {"display_name": member["name"], "locale": member.get("locale", "es")}
        if not identity:
            result = request(f"{api}/auth/v1/admin/users", key, {
                "email": email, "email_confirm": True, "user_metadata": user_data,
                "password": password if member in test_accounts else secrets.token_urlsafe(32)
            })
            identity = result["id"]
        elif member in test_accounts:
            request(f"{api}/auth/v1/admin/users/{UUID(identity)}", key, {"password": password}, method="PUT")
        member["id"] = str(UUID(identity))
        birthday = member.get("birthday")
        if birthday:
            birth_date = date.fromisoformat(birthday)
            member["month"], member["day"] = birth_date.month, birth_date.day
        else:
            month = secrets.randbelow(12) + 1
            member["month"] = month
            member["day"] = secrets.randbelow(calendar.monthrange(2001, month)[1]) + 1

    gifts, pictures = workbook_gifts(args.workbook, members)
    payload = {
        "members": members, "test_members": test_members, "gifts": gifts,
        "official": config["officialName"], "alias": config["alias"],
        "legacy_owner_email": config.get("legacyOwnerEmail")
    }
    encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode()
    seed_sql = Path(__file__).with_suffix(".sql").read_text(encoding="utf-8")
    image_targets = json.loads(sql(seed_sql.replace("__SEED_PAYLOAD__", encoded)))
    for gift_id, path, item_id in image_targets:
        if gift_id not in pictures:
            continue
        picture_format, contents = pictures[gift_id]
        if picture_format not in ("png", "jpeg", "gif", "webp"):
            raise SystemExit("Formato de imagen incompatible con Wishlist.")
        scan_image(contents)
        extension = "jpg" if picture_format == "jpeg" else picture_format
        object_path = f"{path}/{uuid4()}.{extension}"
        request(f"{api}/storage/v1/object/gift-images/{object_path}", key,
                contents, content_type=f"image/{picture_format}")
        sql(f"update public.gift_items set image_url='{object_path}' where id='{UUID(item_id)}' and image_url is null;")
    print(f"Carga local completada: {len(gifts)} regalos del Excel y {len(test_accounts)} cuentas de prueba.")


if __name__ == "__main__":
    main()

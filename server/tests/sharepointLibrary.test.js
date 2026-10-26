const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
const source = fs.readFileSync(
  require.resolve("../services/dev/sharepoint.service"),
  "utf8",
);
function setup(fail = false) {
  const mod = { exports: {} };
  new Function("module", "exports", "process", "fetch", source)(
    mod,
    mod.exports,
    { env: {} },
    async (url) => {
      let body;
      if (url.includes("oauth2"))
        body = { access_token: "test", expires_in: 3600 };
      else if (url.endsWith("/drives"))
        body = { value: [{ id: "d", name: "Documents" }] };
      else if (url.includes("root:/Portal TI:/children"))
        body = {
          value: [
            { id: "juan", name: "Juan Ramírez", folder: {} },
            { id: "oscar", name: "Óscar Santiago", folder: {} },
            { id: "unrelated", name: "Privado", folder: {} },
          ],
        };
      else if (url.includes("/items/juan/children"))
        body = { value: [{ id: "manualJuan", name: "Manuales", folder: {} }] };
      else if (url.includes("/items/oscar/children"))
        body = { value: [{ id: "manualOscar", name: "Manuales", folder: {} }] };
      else if (url.includes("/items/manualJuan/children"))
        body = {
          value: [
            {
              id: "a",
              name: "Manual.pdf",
              file: { mimeType: "application/pdf" },
              lastModifiedDateTime: "2026-09-21",
              listItem: {
                fields: {
                  _ExtendedDescription: "Procedimiento &amp; operación",
                },
              },
            },
          ],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/next",
        };
      else if (url.endsWith("/next"))
        body = {
          value: [
            {
              id: "b",
              name: "Guia.pdf",
              file: { mimeType: "application/pdf" },
              lastModifiedDateTime: "2026-09-22",
            },
          ],
        };
      else if (url.includes("/items/manualOscar/children")) {
        if (fail) return { ok: false, status: 403, text: async () => "" };
        body = {
          value: [
            {
              id: "c",
              name: "Otro manual.pdf",
              file: { mimeType: "application/pdf" },
              lastModifiedDateTime: "2026-09-20",
            },
          ],
        };
      } else throw Error("Unexpected Graph path");
      return { ok: true, json: async () => body };
    },
  );
  const res = {
    statusCode: 200,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };
  return { svc: mod.exports, res };
}
test("library isolates developer folders and Graph pagination with descriptions", async () => {
  const e = setup();
  await e.svc.getDocumentos({ user: { login: "JMRAMIREZ" }, query: {} }, e.res);
  assert.equal(e.res.data.conteos.todo, 2);
  assert.equal(e.res.data.data[0].desarrollador, "Juan Ramírez");
  assert.equal(e.res.data.data[0].descripcion, "Procedimiento & operación");
  assert.ok(e.res.data.data.every((d) => d.desarrollador === "Juan Ramírez"));
});
test("search includes developer and description", async () => {
  const e = setup();
  await e.svc.getDocumentos(
    { user: { login: "JMRAMIREZ" }, query: { q: "operación" } },
    e.res,
  );
  assert.equal(e.res.data.data.length, 1);
});
test("Graph failures do not silently present an empty successful library", async () => {
  const e = setup(true);
  await e.svc.getDocumentos({ user: { login: "OSANTIAGO" }, query: {} }, e.res);
  assert.equal(e.res.statusCode, 502);
  assert.equal(e.res.data.ok, false);
});
test("recent documents use only the authenticated folder", async () => {
  const e = setup();
  await e.svc.getRecientes({ user: { login: "JMRAMIREZ" } }, e.res);
  assert.equal(e.res.data.data[0].id, "b");
});

test("query parameters cannot select another developer", async () => {
  const e = setup();
  await e.svc.getDocumentos(
    {
      user: { login: "osantiago" },
      query: { login: "JMRAMIREZ", developer: "Juan Ramírez" },
    },
    e.res,
  );
  assert.deepEqual(
    e.res.data.data.map((d) => d.id),
    ["c"],
  );
  assert.equal(e.res.data.conteos.todo, 1);
});
test("collection counts are personal", async () => {
  const e = setup();
  await e.svc.getColecciones({ user: { login: "JMRAMIREZ" } }, e.res);
  assert.equal(e.res.data.data.find((c) => c.slug === "manuales").total, 2);
});
for (const endpoint of ["getDocumentos", "getColecciones", "getRecientes"])
  test(endpoint + " denies missing identity", async () => {
    const e = setup();
    await e.svc[endpoint]({ query: {} }, e.res);
    assert.equal(e.res.statusCode, 403);
  });

/** driver.mjs에 명령을 보낸다: node drive.mjs A '[{"goto":"/record"},{"snap":true}]' */
const [key, stepsJson] = process.argv.slice(2);
const res = await fetch("http://127.0.0.1:7777", {
  method: "POST",
  body: JSON.stringify({ key: (key ?? "").toUpperCase(), steps: JSON.parse(stepsJson ?? "[]") }),
});
console.log(await res.text());
process.exitCode = res.ok ? 0 : 1;

/** Versione dell'applicazione: la prima voce di releases.json (aggiornata a ogni rilascio) */
const releases = require('../releases.json');

module.exports = { version: releases[0].version, date: releases[0].date, releases };

// vi.mock ne suit pas les chaînes require() CommonJS pures — on remplace directement
// l'entrée dans le cache de modules Node avant que le fichier réel ne soit chargé.
function mockRequire(callerRequire, relativePath, mockExports) {
    const resolved = callerRequire.resolve(relativePath);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: mockExports,
    };
    return mockExports;
}

module.exports = mockRequire;

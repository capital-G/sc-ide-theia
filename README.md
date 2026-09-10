# SuperColliderIDE

A next generation SuperCollider IDE based on the [Theia IDE Platform](https://theia-ide.org/theia-platform/).
The goal is to have match the batteries included Qt IDE and have a common code base for desktop environments and the web using the wasm ports of sclang and scsynth.

This is still in development.

The wasm IDE is currently deployed via <https://editor.dennis-scheiba.com/>.

## Development and building

The IDE can run in different configurations:

* As standalone electron app
* Running in the browser a local webserver which has access to local sclang
* As a standalone web app which uses the sclang and scsynth wasm port

One can use the `watch` configuration to have hot reload of the sources.

## Running the Electron app

```shell
npm run prepare && npm run build:electron && npm run start:electron
```

## Running the browser app

```shell
npm run prepare && npm run build:browser && npm run start:browser
```

Open <http://localhost:3000> in the browser.

## Running the wasm app

Copy the wasm build files of scsynth and sclang into `browser-only-app/wasm`.

```shell
npm run prepare && npm run build:browser-only && npm run start:browser-only
```

Open <http://localhost:3000> in the browser.

## Credits and Acknowledgements

* Textmate grammar file from [vscode-supercollider](https://github.com/scztt/vscode-supercollider/blob/develop/syntaxes/supercollider.tmLanguage.json) by scztt [MIT]

## License

AGPL-3.0

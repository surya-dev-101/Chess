# Chess

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 13.0.4.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Two-player online games

The Express server is authoritative for the chess position and synchronizes both players through Socket.IO. The first connected browser is White, the second is Black, and additional browsers join as spectators.

For local multiplayer:

1. Build the client with `npm run build`.
2. Start the host with `npm start`.
3. Open `http://localhost:8080/?room=match-1` in two browser windows.

Use the same `room` query value for both players. Use a different value to create another game room. During development, run `npm start` in one terminal and `ng serve` in another; the Angular client automatically connects from port 4200 to the multiplayer server on port 8080.

For hosting, deploy the Node application as a long-running web service with the build output present in `dist/chess`, expose its `PORT`, and forward WebSocket upgrade requests. Both players then open the same HTTPS URL and room query value.

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

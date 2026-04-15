# GitHub Pages Deploy Checklist

- [ ] Commit the Vite base-path change, Pages workflow, README update, and this checklist to `main`.
- [ ] In GitHub, open `Settings -> Pages`.
- [ ] Set `Source` to `GitHub Actions`.
- [ ] Confirm Actions are enabled for the repository.
- [ ] Push to `main` and wait for the `Deploy GitHub Pages` workflow to finish.
- [ ] Open `https://ta-yoshi02.github.io/lanefold/`.
- [ ] If assets 404, confirm `vite.config.ts` still has `base: '/lanefold/'` and the workflow uploads `./dist`.

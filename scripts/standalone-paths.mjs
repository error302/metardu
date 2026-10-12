import { existsSync, lstatSync, realpathSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

function inside(root, target) {
  const relative=path.relative(root,target)
  return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)
}
/** Check both lexical ownership and existing ancestors before modifying build output. */
export function assertBuildDestination(root,target) {
  const absolute=path.resolve(target), workspace=realpathSync(root)
  if(!inside(path.resolve(root),absolute))throw new Error('Build output must remain inside the project directory')
  let ancestor=absolute
  while(!existsSync(ancestor)){const parent=path.dirname(ancestor);if(parent===ancestor)throw new Error('Build output has no owned ancestor');ancestor=parent}
  const actual=realpathSync(ancestor)
  if(actual!==workspace&&!inside(workspace,actual))throw new Error('Build output resolves outside the project directory')
  if(existsSync(absolute)&&lstatSync(absolute).isSymbolicLink())throw new Error('Build output destination must not be a symbolic link')
  return absolute
}
export function standalonePaths(root,dist='.next') {
  const build=assertBuildDestination(root,path.resolve(root,dist))
  return {build,standalone:assertBuildDestination(root,path.join(build,'standalone'))}
}
export function assertNoBundledEnvironmentFiles(standalone) {
  if(existsSync(standalone)&&readdirSync(standalone).some(name=>name==='.env'||name.startsWith('.env.'))){
    throw new Error('Standalone output contains environment files. Preserve them outside the output and rebuild before release.')
  }
}

/** Remove only generated top-level dotenv copies from the owned standalone output. */
export function removeBundledEnvironmentFiles(standalone) {
  if (!existsSync(standalone)) return []
  const root = lstatSync(standalone)
  if (root.isSymbolicLink() || !root.isDirectory()) {
    throw new Error('Standalone output must be a real directory before removing environment files')
  }

  const names = readdirSync(standalone).filter(name => name === '.env' || name.startsWith('.env.')).sort()
  for (const name of names) {
    const target = path.join(standalone, name)
    const entry = lstatSync(target)
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`Refusing to remove non-file environment entry from standalone output: ${name}`)
    }
    rmSync(target)
  }
  return names
}

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sourceKinds } from './backup.mjs';

function docker(args) {
	return execFileSync('docker', args, { encoding: 'utf8', timeout: 15_000 }).trim();
}

function inspect(id) {
	return JSON.parse(
		docker([
			'inspect',
			'--format',
			'{"id":{{json .Id}},"labels":{"com.docker.compose.project":{{json (index .Config.Labels "com.docker.compose.project")}},"com.docker.compose.service":{{json (index .Config.Labels "com.docker.compose.service")}},"com.docker.compose.depends_on":{{json (index .Config.Labels "com.docker.compose.depends_on")}}},"state":{"Running":{{json .State.Running}},"Health":{{with (index .State "Health")}}{"Status":{{json .Status}}}{{else}}null{{end}}}}',
			id
		])
	);
}

export function snapshot(project, sourcesPath) {
	const sources = JSON.parse(readFileSync(sourcesPath, 'utf8'));
	for (const kind of sourceKinds(sources)) {
		if (inspect(sources[kind].container).labels['com.docker.compose.project'] !== project)
			throw new Error('Backup source is outside the declared project');
	}
	const ids = docker([
		'ps',
		'--filter',
		`label=com.docker.compose.project=${project}`,
		'--format',
		'{{.ID}}'
	])
		.split('\n')
		.filter(Boolean);
	if (!ids.length) throw new Error('No running containers in declared project');
	const containers = ids.map(inspect);
	if (
		containers.some(
			(item) => item.labels['com.docker.compose.project'] !== project || !item.state.Running
		)
	)
		throw new Error('Container inventory changed; retry the backup cycle');
	const ordered = [];
	const visiting = new Set();
	const visited = new Set();
	function visit(item) {
		if (visited.has(item.id)) return;
		if (visiting.has(item.id)) throw new Error('Circular Compose dependencies');
		visiting.add(item.id);
		const dependencies = (item.labels['com.docker.compose.depends_on'] ?? '')
			.split(',')
			.map((value) => value.split(':')[0]);
		for (const dependency of containers.filter((candidate) =>
			dependencies.includes(candidate.labels['com.docker.compose.service'])
		))
			visit(dependency);
		visiting.delete(item.id);
		visited.add(item.id);
		ordered.push(item.id);
	}
	containers.forEach(visit);
	return ordered;
}

export async function ready(id, timeoutSeconds) {
	const deadline = Date.now() + timeoutSeconds * 1000;
	for (;;) {
		const { state } = inspect(id);
		if (!state.Running || state.Health?.Status === 'unhealthy')
			throw new Error(`Container ${id} failed to recover`);
		if (!state.Health || state.Health.Status === 'healthy') return;
		if (Date.now() >= deadline) throw new Error(`Container ${id} readiness timed out`);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

if (process.argv[2] === 'snapshot') {
	try {
		console.log(snapshot(process.argv[3], process.argv[4]).join('\n'));
	} catch {
		console.error('Unable to validate backup container scope and dependencies');
		process.exitCode = 1;
	}
} else if (process.argv[2] === 'ready') {
	const timeout = Number(process.argv[4]);
	if (!Number.isInteger(timeout) || timeout < 1 || timeout > 600) process.exitCode = 2;
	else
		try {
			await ready(process.argv[3], timeout);
		} catch {
			console.error(`Container ${process.argv[3]} did not become ready`);
			process.exitCode = 1;
		}
}

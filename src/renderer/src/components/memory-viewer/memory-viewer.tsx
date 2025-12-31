import { Box, Spinner, Text, Button, Tabs, IconButton, Textarea } from '@chakra-ui/react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { FiTrash2, FiRefreshCw, FiEdit2, FiCheck, FiX, FiZoomIn, FiZoomOut } from 'react-icons/fi';
import { useWebSocket } from '@/context/websocket-context';
import { sidebarStyles } from '../sidebar/sidebar-styles';
import { toaster } from '@/components/ui/toaster';

interface Memory {
    id: string;
    content: string;
    type: string;
    created_at: string;
    relative_time: string;
    importance: number;
}

interface GraphNode {
    id: string;
    label: string;
    type: string;
    importance: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

interface GraphEdge {
    source: string;
    target: string;
    label: string;
}

type FilterType = 'all' | 'fact' | 'conversation';
type ViewMode = 'list' | 'graph';

// Force-directed graph simulation
class ForceSimulation {
    nodes: GraphNode[];
    edges: GraphEdge[];
    width: number;
    height: number;

    constructor(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
        this.nodes = nodes.map(n => ({
            ...n,
            x: width / 2 + (Math.random() - 0.5) * 100,
            y: height / 2 + (Math.random() - 0.5) * 100,
            vx: 0,
            vy: 0,
        }));
        this.edges = edges;
        this.width = width;
        this.height = height;
    }

    tick() {
        const REPULSION = 3000;
        const ATTRACTION = 0.03;
        const CENTER_FORCE = 0.01;
        const DAMPING = 0.9;
        const MIN_DISTANCE = 40;

        // Build adjacency map for quick lookup
        const adjacency: Record<string, Set<string>> = {};
        this.nodes.forEach(n => adjacency[n.id] = new Set());
        this.edges.forEach(e => {
            adjacency[e.source]?.add(e.target);
            adjacency[e.target]?.add(e.source);
        });

        // Apply forces
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            // Center gravity
            const dx = this.width / 2 - node.x;
            const dy = this.height / 2 - node.y;
            node.vx += dx * CENTER_FORCE;
            node.vy += dy * CENTER_FORCE;

            // Repulsion from all other nodes
            for (let j = i + 1; j < this.nodes.length; j++) {
                const other = this.nodes[j];
                const fx = node.x - other.x;
                const fy = node.y - other.y;
                const dist = Math.max(MIN_DISTANCE, Math.sqrt(fx * fx + fy * fy));
                const force = REPULSION / (dist * dist);

                const nx = (fx / dist) * force;
                const ny = (fy / dist) * force;

                node.vx += nx;
                node.vy += ny;
                other.vx -= nx;
                other.vy -= ny;
            }
        }

        // Attraction along edges
        this.edges.forEach(edge => {
            const source = this.nodes.find(n => n.id === edge.source);
            const target = this.nodes.find(n => n.id === edge.target);
            if (!source || !target) return;

            const fx = target.x - source.x;
            const fy = target.y - source.y;
            const dist = Math.sqrt(fx * fx + fy * fy) || 1;

            source.vx += fx * ATTRACTION;
            source.vy += fy * ATTRACTION;
            target.vx -= fx * ATTRACTION;
            target.vy -= fy * ATTRACTION;
        });

        // Update positions with damping
        this.nodes.forEach(node => {
            node.vx *= DAMPING;
            node.vy *= DAMPING;
            node.x += node.vx;
            node.y += node.vy;

            // Keep within bounds
            const padding = 30;
            node.x = Math.max(padding, Math.min(this.width - padding, node.x));
            node.y = Math.max(padding, Math.min(this.height - padding, node.y));
        });
    }
}

export function MemoryViewer(): JSX.Element {
    const { baseUrl } = useWebSocket();
    const [memories, setMemories] = useState<Memory[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterType>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState<string>('');
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
    const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
    const [zoom, setZoom] = useState(1);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simulationRef = useRef<ForceSimulation | null>(null);
    const animationRef = useRef<number | null>(null);

    const fetchMemories = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${baseUrl}/api/memories`);
            if (!response.ok) throw new Error('Failed to fetch memories');
            const data = await response.json();
            setMemories(data.memories || []);
        } catch (err: any) {
            setError(err.message || 'Error loading memories');
        } finally {
            setIsLoading(false);
        }
    }, [baseUrl]);

    const fetchGraph = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${baseUrl}/api/memories/graph`);
            if (!response.ok) throw new Error('Failed to fetch memory graph');
            const data = await response.json();
            setGraphNodes(data.nodes || []);
            setGraphEdges(data.edges || []);
        } catch (err: any) {
            setError(err.message || 'Error loading graph');
        } finally {
            setIsLoading(false);
        }
    }, [baseUrl]);

    const deleteMemory = useCallback(async (memoryId: string) => {
        if (!confirm('Are you sure you want to permanently delete this memory?')) return;
        try {
            const response = await fetch(`${baseUrl}/api/memories/${memoryId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete memory');
            setMemories(prev => prev.filter(m => m.id !== memoryId));
            toaster.create({ title: 'Memory permanently deleted', type: 'success', duration: 2000 });
        } catch (err: any) {
            toaster.create({ title: err.message || 'Error deleting memory', type: 'error', duration: 2000 });
        }
    }, [baseUrl]);

    const startEditing = (memory: Memory) => {
        setEditingId(memory.id);
        setEditContent(memory.content);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditContent('');
    };

    const saveEdit = useCallback(async (memoryId: string) => {
        try {
            const response = await fetch(`${baseUrl}/api/memories/${memoryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent }),
            });
            if (!response.ok) throw new Error('Failed to update memory');
            setMemories(prev => prev.map(m => m.id === memoryId ? { ...m, content: editContent } : m));
            setEditingId(null);
            setEditContent('');
            toaster.create({ title: 'Memory updated', type: 'success', duration: 2000 });
        } catch (err: any) {
            toaster.create({ title: err.message || 'Error updating memory', type: 'error', duration: 2000 });
        }
    }, [baseUrl, editContent]);

    // Force-directed graph animation
    useEffect(() => {
        if (viewMode !== 'graph' || !canvasRef.current || graphNodes.length === 0) {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Initialize simulation
        simulationRef.current = new ForceSimulation(graphNodes, graphEdges, width, height);

        let frameCount = 0;
        const maxFrames = 300; // Simulate for ~5 seconds then slow down

        const draw = () => {
            const sim = simulationRef.current;
            if (!sim) return;

            // Run simulation steps (more at start, fewer later)
            const steps = frameCount < 60 ? 3 : 1;
            for (let i = 0; i < steps && frameCount < maxFrames; i++) {
                sim.tick();
            }
            frameCount++;

            // Clear canvas with dark background
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.scale(zoom, zoom);
            ctx.translate(-width / 2, -height / 2);

            // Draw edges
            ctx.strokeStyle = 'rgba(100, 100, 120, 0.4)';
            ctx.lineWidth = 1;
            sim.edges.forEach(edge => {
                const source = sim.nodes.find(n => n.id === edge.source);
                const target = sim.nodes.find(n => n.id === edge.target);
                if (source && target) {
                    ctx.beginPath();
                    ctx.moveTo(source.x, source.y);
                    ctx.lineTo(target.x, target.y);
                    ctx.stroke();
                }
            });

            // Draw nodes
            sim.nodes.forEach(node => {
                const radius = 4 + (node.importance || 3);
                const color = node.type === 'fact' ? '#10b981' : '#6366f1';

                // Glow effect
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI);
                ctx.fillStyle = color + '30';
                ctx.fill();

                // Node circle
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
            });

            // Draw labels on hover (simplified: show all labels small)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = '8px sans-serif';
            ctx.textAlign = 'center';
            sim.nodes.forEach(node => {
                const label = node.label.substring(0, 15) + (node.label.length > 15 ? '...' : '');
                ctx.fillText(label, node.x, node.y + 15);
            });

            ctx.restore();

            // Continue animation if still settling
            if (frameCount < maxFrames + 100) {
                animationRef.current = requestAnimationFrame(draw);
            }
        };

        draw();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [viewMode, graphNodes, graphEdges, zoom]);

    useEffect(() => {
        if (viewMode === 'list') {
            fetchMemories();
        } else {
            fetchGraph();
        }
    }, [viewMode, fetchMemories, fetchGraph]);

    const filteredMemories = memories.filter(m => {
        if (filter === 'all') return true;
        return m.type === filter;
    });

    if (isLoading) {
        return (
            <Box display="flex" justifyContent="center" p={4}>
                <Spinner color="white" />
            </Box>
        );
    }

    if (error) {
        return (
            <Box p={4}>
                <Text color="red.300">{error}</Text>
                <Button onClick={viewMode === 'list' ? fetchMemories : fetchGraph} mt={2} size="sm">Retry</Button>
            </Box>
        );
    }

    return (
        <Box>
            {/* View Mode Toggle */}
            <Box display="flex" gap={2} mb={3} alignItems="center">
                <Button
                    size="sm"
                    variant={viewMode === 'list' ? 'solid' : 'ghost'}
                    onClick={() => setViewMode('list')}
                    color="white"
                >
                    List View
                </Button>
                <Button
                    size="sm"
                    variant={viewMode === 'graph' ? 'solid' : 'ghost'}
                    onClick={() => setViewMode('graph')}
                    color="white"
                >
                    Graph View
                </Button>
                {viewMode === 'graph' && (
                    <>
                        <IconButton aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} size="xs" variant="ghost" color="white"><FiZoomOut /></IconButton>
                        <Text fontSize="xs" color="whiteAlpha.600">{Math.round(zoom * 100)}%</Text>
                        <IconButton aria-label="Zoom in" onClick={() => setZoom(z => Math.min(2, z + 0.25))} size="xs" variant="ghost" color="white"><FiZoomIn /></IconButton>
                    </>
                )}
                <IconButton
                    aria-label="Refresh"
                    onClick={viewMode === 'list' ? fetchMemories : fetchGraph}
                    size="sm"
                    variant="ghost"
                    color="white"
                    ml="auto"
                >
                    <FiRefreshCw />
                </IconButton>
            </Box>

            {viewMode === 'graph' ? (
                <Box>
                    <Text fontSize="sm" color="whiteAlpha.600" mb={2}>
                        {graphNodes.length} nodes • {graphEdges.length} connections
                    </Text>
                    <Box display="flex" gap={2} mb={2}>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Box w={3} h={3} borderRadius="full" bg="#10b981" />
                            <Text fontSize="xs" color="whiteAlpha.600">Facts</Text>
                        </Box>
                        <Box display="flex" alignItems="center" gap={1}>
                            <Box w={3} h={3} borderRadius="full" bg="#6366f1" />
                            <Text fontSize="xs" color="whiteAlpha.600">Conversations</Text>
                        </Box>
                    </Box>
                    <canvas
                        ref={canvasRef}
                        width={450}
                        height={400}
                        style={{ borderRadius: '8px', background: '#1a1a2e', width: '100%' }}
                    />
                </Box>
            ) : (
                <>
                    {/* Filter Tabs */}
                    <Tabs.Root value={filter} onValueChange={(e) => setFilter(e.value as FilterType)} size="sm">
                        <Tabs.List mb={3}>
                            <Tabs.Trigger value="all">All ({memories.length})</Tabs.Trigger>
                            <Tabs.Trigger value="fact">Facts ({memories.filter(m => m.type === 'fact').length})</Tabs.Trigger>
                            <Tabs.Trigger value="conversation">Conversations ({memories.filter(m => m.type === 'conversation').length})</Tabs.Trigger>
                        </Tabs.List>
                    </Tabs.Root>

                    {/* Memory List */}
                    {filteredMemories.map((memory) => (
                        <Box key={memory.id} {...sidebarStyles.memoryDrawer.memoryItem}>
                            <Box {...sidebarStyles.memoryDrawer.memoryHeader}>
                                <Box display="flex" alignItems="center" gap={2}>
                                    <Text {...sidebarStyles.memoryDrawer.memoryTypeParams}>{memory.type}</Text>
                                    <Text fontSize="xs" color="whiteAlpha.500">
                                        {memory.created_at ? formatDistanceToNow(new Date(memory.created_at), { addSuffix: true }) : ''}
                                    </Text>
                                </Box>
                                <Box display="flex" gap={1}>
                                    {editingId === memory.id ? (
                                        <>
                                            <IconButton aria-label="Save" onClick={() => saveEdit(memory.id)} size="xs" variant="ghost" colorScheme="green"><FiCheck /></IconButton>
                                            <IconButton aria-label="Cancel" onClick={cancelEditing} size="xs" variant="ghost" colorScheme="gray"><FiX /></IconButton>
                                        </>
                                    ) : (
                                        <>
                                            <IconButton aria-label="Edit" onClick={() => startEditing(memory)} size="xs" variant="ghost" colorScheme="blue"><FiEdit2 /></IconButton>
                                            <IconButton aria-label="Delete" onClick={() => deleteMemory(memory.id)} size="xs" variant="ghost" colorScheme="red"><FiTrash2 /></IconButton>
                                        </>
                                    )}
                                </Box>
                            </Box>
                            <Text fontSize="xs" color="whiteAlpha.600" mb={1}>Importance: {memory.importance}/5</Text>
                            {editingId === memory.id ? (
                                <Textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    minH="100px"
                                    bg="whiteAlpha.100"
                                    color="white"
                                    border="1px solid"
                                    borderColor="whiteAlpha.300"
                                    _focus={{ borderColor: 'blue.400' }}
                                    fontSize="sm"
                                />
                            ) : (
                                <Text {...sidebarStyles.memoryDrawer.memoryContent}>{memory.content}</Text>
                            )}
                        </Box>
                    ))}
                    {filteredMemories.length === 0 && (
                        <Box p={4} textAlign="center">
                            <Text color="whiteAlpha.500">{filter === 'all' ? 'No memories found.' : `No ${filter}s found.`}</Text>
                        </Box>
                    )}
                </>
            )}
        </Box>
    );
}

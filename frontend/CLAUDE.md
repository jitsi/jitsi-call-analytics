# Frontend CLAUDE.md

This file provides guidance for working with the frontend workspace of Jitsi Call Analytics.

## Frontend Architecture

### Technology Stack
- **React 18**: UI framework
- **Material-UI (MUI) v5**: Component library with custom 8x8 theme
- **TypeScript**: Type safety and better developer experience
- **React Router v6**: Client-side routing
- **Axios**: HTTP client for API communication
- **Socket.IO Client**: Real-time WebSocket connections
- **D3.js & Plotly**: Data visualization libraries

### Component Structure

Key components in `src/components/`:
- **CallAnalyzer**: Main dashboard and meeting URL input
- **CallTimeline**: Interactive participant timeline visualization
- **EndpointDetails**: Full-screen participant debugging interface
- **RTCStatsSearch**: Production conference search and download UI
- **WebRTCStatsVisualizer**: WebRTC statistics visualization
- **TimelineVisualization**: SVG-based timeline rendering
- **JVBDetails**: Jitsi Videobridge statistics (TODO)
- **JicofoDetails**: Jicofo/shard monitoring (TODO)
- **EnhancedCard**: Reusable card component with enhanced styling

### Services

API client services in `src/services/`:
- **AnalysisService**: Session analysis and participant data API calls
- **RTCStatsService**: RTCStats integration API calls

### Routing

Routes defined in `src/App.tsx`:
- `/`: Main dashboard (CallAnalyzer)
- `/endpoint/:endpointId`: Endpoint details page
- `/jvb/:bridgeId`: JVB monitoring (TODO)
- `/jicofo/:shardId`: Jicofo monitoring (TODO)

## Development Commands

```bash
# From frontend directory
cd frontend

# Start development server
npm start        # or npm run dev
# Opens http://localhost:3000

# Build for production
npm run build
# Output in build/ directory

# Run tests
npm test

# Linting
npm run lint
npm run lint:fix
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Backend API endpoint
REACT_APP_API_URL=http://localhost:5000

# Optional: Custom port for dev server
PORT=3000
```

**Note**: Environment variables must be prefixed with `REACT_APP_` to be accessible in the React app.

## API Integration

### Service Layer Pattern

All API calls go through service classes in `src/services/`:

```typescript
// src/services/AnalysisService.ts
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export class AnalysisService {
    static async getSession(sessionId: string): Promise<CallSession> {
        const response = await axios.get(`${API_BASE_URL}/api/v1/sessions/${sessionId}`);
        if (response.data.success) {
            return response.data.data;
        }
        throw new Error(response.data.error.message);
    }
}
```

### API Response Handling

Backend returns standardized responses:
```typescript
// Success
{
  success: true,
  data: { ... },
  timestamp: "2025-10-02T12:34:56.789Z"
}

// Error
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "Error message",
    details: { ... }
  },
  timestamp: "2025-10-02T12:34:56.789Z"
}
```

Handle in components:
```typescript
const fetchData = async () => {
    try {
        const data = await AnalysisService.getSession(sessionId);
        setSessionData(data);
    } catch (error) {
        setError(error.message);
    }
};
```

## Component Development

### Material-UI Theming

Custom 8x8 theme in `src/theme/8x8Theme.ts`:
- Primary color: 8x8 brand blue
- Dark mode support
- Custom typography scale
- Enhanced component defaults

Use theme in components:
```typescript
import { useTheme } from '@mui/material/styles';

function MyComponent() {
    const theme = useTheme();

    return (
        <Box sx={{
            bgcolor: theme.palette.primary.main,
            p: theme.spacing(2)
        }}>
            Content
        </Box>
    );
}
```

### Common Patterns

**API data fetching with loading state:**
```typescript
const [data, setData] = useState<CallSession | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
    const fetchData = async () => {
        try {
            setLoading(true);
            const result = await AnalysisService.getSession(sessionId);
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    fetchData();
}, [sessionId]);

if (loading) return <CircularProgress />;
if (error) return <Alert severity="error">{error}</Alert>;
```

**Type-safe props:**
```typescript
interface MyComponentProps {
    participant: ParticipantDetails;
    onSelect?: (id: string) => void;
}

const MyComponent: React.FC<MyComponentProps> = ({ participant, onSelect }) => {
    // Implementation
};
```

## Timeline Visualization

### CallTimeline Component

Interactive SVG-based timeline showing:
- Participant tracks (one per participant)
- Join/leave events
- Screen sharing indicators
- Media state changes (audio/video mute)
- Quality metrics overlay

**Key features:**
- Zoom and pan support
- Hover tooltips
- Click to select participant
- Time axis with grid lines

### TimelineVisualization Component

Lower-level SVG rendering component:
- Calculates track positions
- Renders event markers
- Handles mouse interactions
- Manages scale and viewport

## RTCStats Integration UI

### RTCStatsSearch Component

Production conference search interface:
- Environment selection (prod, pilot, debug)
- Search by conference URL or ID
- Download management with progress tracking
- List of downloaded conferences
- Integration with backend RTCStats API

**Workflow:**
1. User searches for conference
2. Select conference from results
3. Initiate download
4. Monitor progress
5. Analyze once downloaded

## WebRTC Statistics Visualization

### WebRTCStatsVisualizer Component

Visualizes WebRTC metrics:
- Packet loss graphs
- Bitrate over time
- Jitter measurements
- RTT (round-trip time)
- Audio/video quality scores

Uses Plotly.js for interactive charts with zoom, pan, and hover tooltips.

## Testing Strategy

### Component Tests

Use React Testing Library for component tests:
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import CallAnalyzer from './CallAnalyzer';

describe('CallAnalyzer', () => {
    it('should render input field', () => {
        render(<CallAnalyzer />);
        const input = screen.getByPlaceholderText(/enter meeting url/i);
        expect(input).toBeInTheDocument();
    });

    it('should handle submit', () => {
        render(<CallAnalyzer />);
        const button = screen.getByRole('button', { name: /analyze/i });
        fireEvent.click(button);
        // Assert expected behavior
    });
});
```

### Running Tests
```bash
npm test              # Interactive watch mode
npm test -- --coverage  # With coverage report
```

## Common Development Tasks

### Adding a New Component

1. Create component file in `src/components/`:
```typescript
// MyComponent.tsx
import React from 'react';
import { Box, Typography } from '@mui/material';

interface MyComponentProps {
    title: string;
}

const MyComponent: React.FC<MyComponentProps> = ({ title }) => {
    return (
        <Box>
            <Typography variant="h5">{title}</Typography>
        </Box>
    );
};

export default MyComponent;
```

2. Import and use in parent component

3. Add tests in `MyComponent.test.tsx`

### Adding a New Route

1. Create route component
2. Add route to `App.tsx`:
```typescript
import MyNewPage from './components/MyNewPage';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/new-page" element={<MyNewPage />} />
                {/* ... */}
            </Routes>
        </Router>
    );
}
```

### Adding a New API Service Method

1. Add method to appropriate service class:
```typescript
// src/services/AnalysisService.ts
static async getParticipantLogs(
    participantId: string,
    level?: string
): Promise<LogEntry[]> {
    const params = level ? `?level=${level}` : '';
    const response = await axios.get(
        `${API_BASE_URL}/api/v1/participants/${participantId}/logs${params}`
    );
    return response.data.data;
}
```

2. Use in component:
```typescript
const logs = await AnalysisService.getParticipantLogs(participantId, 'ERROR');
```

### Styling with Material-UI

**Prefer `sx` prop for inline styles:**
```typescript
<Box sx={{
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    p: 3,
    bgcolor: 'background.paper'
}}>
```

**Use theme spacing units:**
```typescript
sx={{
    p: 2,    // padding: theme.spacing(2) = 16px
    m: 1,    // margin: theme.spacing(1) = 8px
    gap: 3   // gap: theme.spacing(3) = 24px
}}
```

**Responsive styles:**
```typescript
sx={{
    width: { xs: '100%', md: '50%' },
    fontSize: { xs: '14px', sm: '16px', md: '18px' }
}}
```

## TypeScript Types

### Importing Shared Types

```typescript
import {
    CallSession,
    ParticipantDetails,
    EnhancedCallEvent
} from '../../../shared/types';
```

### Component Props Types

Always define explicit prop types:
```typescript
interface ComponentProps {
    data: CallSession;
    loading?: boolean;
    onError?: (error: Error) => void;
}
```

### API Response Types

Match backend response structure:
```typescript
interface ApiResponse<T> {
    success: boolean;
    data: T;
    timestamp: string;
}

interface ApiError {
    success: false;
    error: {
        code: string;
        message: string;
        details?: any;
    };
    timestamp: string;
}
```

## Performance Considerations

### Optimization Techniques

1. **Memoization** for expensive computations:
```typescript
const processedData = useMemo(() => {
    return expensiveProcessing(rawData);
}, [rawData]);
```

2. **Callback memoization**:
```typescript
const handleClick = useCallback((id: string) => {
    // Handler logic
}, [dependencies]);
```

3. **Component memoization**:
```typescript
export default React.memo(MyComponent);
```

4. **Virtualization** for long lists (use `react-window` if needed)

### Large Timeline Rendering

For conferences with 100+ participants:
- Use SVG virtualization to render only visible tracks
- Implement timeline pagination or viewport clipping
- Debounce zoom/pan events

## Known Limitations

- Timeline performance degrades with 100+ participants (consider virtualization)
- Large WebRTC stats datasets may impact chart rendering (use data sampling)
- No offline mode or service worker (consider adding PWA support)
- Authentication not implemented (add JWT handling when backend adds auth)

## Deployment

### Production Build

```bash
npm run build
```

Output in `build/` directory. Serve with static file server or integrate with backend:

```typescript
// In backend/src/index.ts
app.use(express.static(path.join(__dirname, '../../frontend/build')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/build/index.html'));
});
```

### Environment-Specific Builds

Use different `.env` files:
- `.env.development`: Development configuration
- `.env.production`: Production configuration
- `.env.local`: Local overrides (gitignored)

React scripts automatically loads the appropriate file based on `NODE_ENV`.
